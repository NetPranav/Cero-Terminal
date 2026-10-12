/**
 * ModelReply.ts: understand what a model sent back, whichever model it was.
 *
 * The built-in model, Ollama and the cloud APIs all go through here, so the same answer means the
 * same action. Accepts fenced blocks, prose around one JSON object, think-tags, several field names
 * for the same thing, native tool calls, and repairs three common slips once.
 */

export interface ModelAction {
  action: 'tool' | 'done' | 'error' | 'execute';
  tool?: string;
  command?: string;
  explanation?: string;
  params?: Record<string, any>;
  summary?: string;
  message?: string;
}

export type ReplyParse =
  | { ok: true; value: ModelAction; repaired: boolean }
  | { ok: false; reason: string };

/** Take out reasoning text: closed <think> blocks, and an unclosed one that runs to the end */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '').trim();
}

/** The text of the first ```json fenced block, or the text with a surrounding fence removed */
function unfence(text: string): string {
  const block = text.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/);
  if (block) return block[1].trim();
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

/** The first balanced {...} in the text, string-aware. Returns the rest when it never closes. */
function firstObject(text: string): { json: string; closed: boolean } | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return { json: text.slice(start, i + 1), closed: true }; }
  }
  return { json: text.slice(start), closed: false };
}

/** Repair the common slips: trailing commas, single quotes, a cut-off ending */
export function repairJson(raw: string): string {
  let s = raw.trim();
  if (!s.includes('"') && s.includes("'")) s = s.replace(/'/g, '"');
  s = s.replace(/,\s*([}\]])/g, '$1');
  // a cut-off reply: close an open string, then open brackets
  let inString = false;
  let escape = false;
  const stack: string[] = [];
  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (inString) s += '"';
  s = s.replace(/,\s*$/, '');
  while (stack.length) s += stack.pop();
  return s.replace(/,\s*([}\]])/g, '$1');
}

const asObject = (v: unknown): Record<string, any> | undefined => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, any>;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return p && typeof p === 'object' && !Array.isArray(p) ? p : undefined; } catch { return undefined; }
  }
  return undefined;
};

/** One internal shape from every format */
export function normalizeAction(input: any): ModelAction | null {
  if (!input || typeof input !== 'object') return null;
  let obj: any = input;

  // an array of calls: use the first
  if (Array.isArray(obj)) obj = obj[0];
  if (!obj || typeof obj !== 'object') return null;

  // the whole API reply: choices[0].message
  if (Array.isArray(obj.choices) && obj.choices[0]?.message) obj = obj.choices[0].message;

  // native tool calls: {tool_calls:[{function:{name, arguments}}]}
  const call = Array.isArray(obj.tool_calls) ? obj.tool_calls[0] : obj.tool_call ?? obj.function_call;
  if (call) {
    const fn = call.function ?? call;
    const args = asObject(fn.arguments) ?? asObject(fn.params) ?? {};
    const name = String(fn.name || fn.tool || '').trim();
    if (name) obj = { action: 'tool', tool: name, params: args };
  }

  // {"tool": "...", "arguments": {...}} and {"action": "tool", "arguments": {...}}
  if (obj.arguments !== undefined && obj.params === undefined) {
    const args = asObject(obj.arguments);
    if (args) obj = { ...obj, params: args };
  }
  // {"name": "shell.execute", "arguments": ...}: some servers use "name"
  if (!obj.tool && typeof obj.name === 'string' && obj.name.includes('.') && obj.params) obj = { ...obj, tool: obj.name };

  // 1. Shell-native contract: {"action": "execute", "command": "..."} or a bare command
  if (obj.action === 'execute' || (!obj.action && typeof obj.command === 'string')) {
    return {
      action: 'tool',
      tool: 'shell.execute',
      params: { command: obj.command, explanation: obj.explanation || obj.params?.explanation || `Executing: ${obj.command}` },
    };
  }

  // 2. A tool call that is really a shell command
  if (obj.action === 'tool') {
    if ((obj.tool === 'shell.execute' || !obj.tool) && (obj.command || obj.params?.command)) {
      const cmd = obj.command || obj.params.command;
      return { action: 'tool', tool: 'shell.execute', params: { command: cmd, explanation: obj.explanation || obj.params?.explanation || `Executing: ${cmd}` } };
    }
    if (obj.tool && !obj.params && obj.command) obj = { ...obj, params: { command: obj.command, explanation: obj.explanation } };
  }

  // 3. {"action": "<tool name>", "params": {...}}: the tool name put in the action field
  if (typeof obj.action === 'string' && obj.action.includes('.') && !obj.tool) obj = { ...obj, tool: obj.action, action: 'tool' };

  if (!obj.action) {
    if (obj.tool) obj = { ...obj, action: 'tool' };
    else if (obj.summary || obj.response || obj.message || obj.result) obj = { ...obj, action: 'done' };
  }
  if (obj.action === 'done' && !obj.summary) {
    const text = obj.response ?? obj.message ?? obj.result;
    if (typeof text === 'string') obj = { ...obj, summary: text };
  }
  if (obj.action === 'tool' || obj.action === 'done' || obj.action === 'error') return obj as ModelAction;
  return null;
}

/** Parse a model's reply. `finishedByLength` allows the cut-off repair. */
export function parseModelReply(content: string, opts: { finishedByLength?: boolean } = {}): ReplyParse {
  if (!content || !content.trim()) return { ok: false, reason: 'empty reply' };
  const text = unfence(stripThinking(content));
  if (!text) return { ok: false, reason: 'only reasoning text, no answer' };

  const tryParse = (json: string): ModelAction | null => {
    try { return normalizeAction(JSON.parse(json)); } catch { return null; }
  };

  // 1. the whole text
  const direct = tryParse(text);
  if (direct) return { ok: true, value: direct, repaired: false };

  // 2. the first object inside prose
  const found = firstObject(text);
  if (found) {
    if (found.closed) {
      const inner = tryParse(found.json);
      if (inner) return { ok: true, value: inner, repaired: false };
    }
    // 3. one repair: trailing comma, single quotes, cut-off ending
    if (found.closed || opts.finishedByLength || !found.closed) {
      const fixed = tryParse(repairJson(found.json));
      if (fixed && (found.closed || opts.finishedByLength)) return { ok: true, value: fixed, repaired: true };
    }
  }
  // 4. a top-level array of calls
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) {
    const parsed = tryParse(arr[0]);
    if (parsed) return { ok: true, value: parsed, repaired: false };
  }
  return { ok: false, reason: found && !found.closed ? 'the reply was cut off' : 'no usable JSON in the reply' };
}
