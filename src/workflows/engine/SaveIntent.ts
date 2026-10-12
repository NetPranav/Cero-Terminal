/**
 * SaveIntent.ts: understand "...and save this as a workflow" written anywhere inside a prompt.
 *
 * Pure text in, plain object out. It removes the save words from the task, finds an optional name,
 * and refuses to trigger on questions or on talk about workflows ("how do I save a workflow?").
 */
import { parseFlowCreateRequest } from '../flow/FlowAuthoring';

export interface SaveIntent {
  /** The prompt with the save words removed, trimmed. Empty means the retrospective form. */
  task: string;
  save: boolean;
  /** "morning setup", cleaned. Undefined when the prompt gave none. */
  name?: string;
  position: 'start' | 'end' | 'middle' | 'none';
  /** "on the desktop" / "in this folder": skips the where-to-save question */
  place?: 'desktop' | 'here';
}

const MAX_NAME_WORDS = 6;
const MAX_NAME_CHARS = 60;

const OBJ = String.raw`(?:all\s+(?:of\s+)?this|all\s+these\s+steps|these\s+steps|(?:this|that|the)\s+(?:task|thing|session|sequence|procedure)|the\s+whole\s+(?:thing|task|sequence)|this|it|that|everything|the\s+above|the\s+steps|the\s+last\s+(?:\d+\s+)?(?:steps?|commands?)|the\s+(?:verified\s+)?(?:result|execution|pipeline))`;
const TARGET = String.raw`(?:as|into)\s+(?:an?\s+)?(?:reusable\s+)?(?:\.?flow|workflow|macro)(?:\s+file)?`;
// "save|store|keep|record|remember [object] as a workflow" or "turn|make|convert <object> [into|as] a workflow"
const MAKE_TARGET = String.raw`(?:(?:as|into)\s+)?(?:an?\s+)?(?:reusable\s+)?(?:\.?flow|workflow|macro)(?:\s+file)?`;
const CLAUSE_CORE = String.raw`(?:(?:save|store|keep|record|remember)\s+(?:${OBJ}\s+)?${TARGET}|(?:turn|make|convert)\s+${OBJ}\s+${MAKE_TARGET})`;
// "save [this|the] workflow [as|named|called X]": the word workflow is the thing being saved
const CLAUSE_WORKFLOW = String.raw`(?:save|store|keep|record|remember)\s+(?:(?:this|that|the)\s+)?(?:workflow|flow)`;
const NAME = String.raw`(?:"([^"]{1,60})"|'([^']{1,60})'|([A-Za-z0-9_\- ]+?)(?=\s*(?:[,.;:!?]|\s(?:and|then|after)\b|\s(?:on|to|in|into)\s+(?:the\s+|my\s+)?(?:desktop|this\s+folder|current\s+folder|here)\b|$)))`;
// A name given with no "named": "save as workflow dev". Short, not starting with a command word or a
// connector, so "save this as a workflow open youtube" is not read as a workflow called "open youtube".
const NOT_NAME_START = String.raw`(?!(?:and|then|also|after|on|in|into|to|at|here|please|for|so|with|using|from|open|run|start|launch|install|play|show|close|create|make|go|cd|list|check|find|search|download|stop|kill|quit|visit|browse|turn|set|enable|disable|connect|git|npm|sudo|ping)\b)`;
const BARE_NAME = String.raw`\s+${NOT_NAME_START}(?:"([^"]{1,60})"|'([^']{1,60})'|([A-Za-z0-9_\-]+(?:\s(?!(?:and|then|after|also)\b)[A-Za-z0-9_\-]+){0,2})(?=\s*(?:[,.;:!?]|\s(?:and|then|after)\b|\s(?:on|to|in|into)\s+(?:the\s+|my\s+)?(?:desktop|this\s+folder|current\s+folder|here)\b|$)))`;
// Same group layout in every tail: 3 groups per name form, then the place group
const NAME_TAIL = String.raw`(?:\s+(?:called|named|titled)\s+${NAME}|\s*=\s*${NAME}|${BARE_NAME})?`;
const NAME_TAIL_AS = String.raw`(?:\s+(?:called|named|titled|as)\s+${NAME}|\s*=\s*${NAME}|${BARE_NAME})?`;
const PLACE = String.raw`(?:\s+(?:on|to|in|into)\s+(?:the\s+|my\s+)?(desktop|this\s+folder|current\s+folder|here))?`;
const CONNECT = String.raw`(?:(?:[,;]|\.)?\s*(?:and\s+then|and|then|also|after\s+that)?\s*)?`;
const LEAD = String.raw`(?:after\s+(?:successfully\s+)?(?:completing|finishing)\s+(?:all\s+of\s+these\s+steps|everything|this|all\s+steps)[,.]?\s+)?`;
const PLEASE = String.raw`(?:please\s+)?`;

const SAVE_RE = new RegExp(String.raw`${LEAD}${CONNECT}\b${PLEASE}(${CLAUSE_CORE})${NAME_TAIL}${PLACE}\s*[.:!;]?`, 'i');
const SAVE_WORKFLOW_RE = new RegExp(String.raw`${LEAD}${CONNECT}\b${PLEASE}(${CLAUSE_WORKFLOW})${NAME_TAIL_AS}${PLACE}\s*[.:!;]?`, 'i');
const DELIMITED_RE = /^([\s\S]+?)\s*::\s*save\s+(?:as\s+)?workflow\s+(?:"([^"]+)"|'([^']+)'|([^\s].*?))\s*$/i;
const QUESTION_START = /^(?:how|what|why|when|where|who|which|can\s+you\s+explain|could\s+you\s+explain|explain|does|do\s+i|is\s+there|tell\s+me)\b/i;
const ALWAYS_QUESTION = /^(?:can\s+you\s+explain|could\s+you\s+explain|explain|does|do\s+i|is\s+there|tell\s+me)\b/i;
const ABOUT_WORKFLOWS = /^(?:please\s+)?(?:list|show|delete|remove|run|open|rename|edit|export|import)\s+(?:my\s+|the\s+|all\s+)*(?:workflows?|flows?)\b/i;

/** "morning setup workflow" -> "morning setup"; limits words and length */
export function cleanName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let text = raw.replace(/[^A-Za-z0-9_\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
  // a trailing "workflow" is filler ("morning setup workflow"); "flow" can be part of the name ("hello flow")
  text = text.replace(/\s+workflow$/i, '').trim();
  const words = text.split(' ').filter(Boolean).slice(0, MAX_NAME_WORDS);
  text = words.join(' ').slice(0, MAX_NAME_CHARS).trim();
  return text || undefined;
}

const tidy = (text: string) => text
  .replace(/[ \t]+/g, ' ')
  .replace(/[ \t]+([,;.])/g, '$1')
  .replace(/^[\s,;:.]+/, '')
  .replace(/^(?:and\s+then|and|then|also)\s+/i, '')
  .replace(/\s+(?:and\s+then|and|then|also|after\s+that)\s*$/i, '')
  .replace(/\s*\n\s*$/, '')
  .replace(/[\s,;:]+$/, '')
  .trim();

/** The turn-by-turn answer: does this prompt ask to save what it does, and what is the task? */
export function parseSaveIntent(prompt: string): SaveIntent {
  const text = (prompt || '').replace(/^>\s*/, '').trim();
  const none: SaveIntent = { task: text, save: false, position: 'none' };
  if (!text) return none;
  if (ALWAYS_QUESTION.test(text) || ABOUT_WORKFLOWS.test(text) || /\?\s*$/.test(text)) return none;
  // "make me a workflow that ..." is the make-a-file route; it never runs the steps
  if (parseFlowCreateRequest(text)) return none;

  const delimited = text.match(DELIMITED_RE);
  if (delimited) {
    const name = cleanName(delimited[2] || delimited[3] || delimited[4]);
    return { task: delimited[1].trim(), save: true, name, position: 'end' };
  }

  const match = SAVE_RE.exec(text) ?? SAVE_WORKFLOW_RE.exec(text);
  if (!match) return none;
  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  const name = cleanName(match.slice(2, 11).find(Boolean));
  const placeWord = (match[11] || '').toLowerCase();
  const place = placeWord ? (placeWord === 'desktop' ? 'desktop' : 'here') : undefined;
  const task = tidy(`${before} ${after}`);
  // "how to save this as a workflow": a question about saving, not a task
  if (QUESTION_START.test(text) && task.split(/\s+/).length <= 3) return none;
  const hasBefore = tidy(before).length > 0;
  const hasAfter = tidy(after).length > 0;
  const position = hasBefore && hasAfter ? 'middle' : hasBefore ? 'end' : hasAfter ? 'start' : 'none';
  return { task, save: true, name, place, position: position === 'none' ? 'end' : position };
}

/** "open gitbrains in vs code" -> "open-gitbrains-in-vs-code" */
export function suggestWorkflowName(task: string): string {
  const slug = task.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 6).join('-');
  return slug || 'my-workflow';
}

/** How many of the last steps a retrospective save covers ("the last 3 steps"); 10 by default */
export function lastStepCount(prompt: string): number {
  const m = prompt.match(/\blast\s+(\d{1,3})\b/i);
  return m ? Math.max(1, parseInt(m[1], 10)) : 10;
}
