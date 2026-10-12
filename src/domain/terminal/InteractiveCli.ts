/**
 * InteractiveCli.ts — commands that stop to ask questions.
 *
 * Agent steps run without a terminal: stdin is closed, so a prompt reads end-of-input. Some
 * programs then fail, others (create-next-app) print their menu and exit 0 having done nothing,
 * which looked like success and let the next steps run against a project that did not exist.
 *
 * Two answers, in order:
 * 1. When the request already says enough, run the program's own non-interactive form
 *    (`create-next-app <name> --yes` takes the recommended defaults).
 * 2. Otherwise, recognise the unanswered prompt in the output so the step is handed to a terminal
 *    pane where the person answers it, and the task continues once the program has finished.
 */

/** Prompts printed by the interactive CLI libraries (prompts, inquirer, clack, enquirer) and package managers */
const UNANSWERED_PROMPT_PATTERNS: RegExp[] = [
  /use arrow[- ]keys/i,                              // prompts / inquirer select menus
  /return to submit/i,                               // prompts
  /\(use arrow keys\)/i,                             // inquirer
  /press <?space>? to select/i,                      // checkbox menus
  /^\s*[?◆◇]\s.+(?:›|»|…)\s*.*$/m,                   // "? Project name: › my-app", clack "◆ Pick a framework"
  /^\s*[│|]\s+[●○◻◼]\s+\S/m,                          // clack option rows ("│  ● Vanilla")
  /^\s*[?]\s.+\((?:y\/n|Y\/n|y\/N)\)\s*$/m,          // inquirer confirm
  /ok to proceed\?\s*\(y\)/i,                        // npx install confirmation
  /\[[Yy]\/[Nn]\]\s*$/m,
  /\(yes\/no(?:\/cancel)?\)/i,
  /select an option:\s*$/im,
];

/** True when the output ends at a question nobody could answer (stdin was closed). */
export function hasUnansweredPrompt(output: string): boolean {
  if (!output) return false;
  // Drop colour and cursor codes: the menus are drawn with them
  const plain = output.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b[()][A-Za-z0-9]/g, '');
  const tail = plain.split(/\r?\n/).filter(l => l.trim()).slice(-12).join('\n');
  return UNANSWERED_PROMPT_PATTERNS.some(p => p.test(tail));
}

/**
 * The same command in a form that does not ask anything, when the program has one and nothing
 * the user said needs an answer. Returns the command unchanged otherwise.
 */
export function nonInteractiveForm(command: string): string {
  if (!command || typeof command !== 'string') return command;
  let out = command;

  // create-next-app: --yes takes the recommended defaults (TypeScript, ESLint, Tailwind, App Router)
  if (/\bcreate-next-app\b/.test(out) || /\b(?:npm|pnpm|yarn|bun)\s+create\s+next-app\b/.test(out)) {
    if (!/(?:^|\s)--yes\b/.test(out.replace(/\bnpx\s+--yes\b/, 'npx'))) {
      // Before any shell operator that follows the command ("... && cd x")
      out = out.replace(/(create[- ]next-app(?:@[\w.-]+)?[^;&|]*?)(\s*(?:&&|\|\||;|\||$))/, (_m, cmd: string, rest: string) => `${cmd.trimEnd()} --yes${rest}`);
    }
  }

  // npm init with no flags asks a dozen questions
  out = out.replace(/\bnpm\s+init(?!\s+(?:-y\b|--yes\b|[\w@]))(\s*(?:&&|\|\||;|\||$))/g, 'npm init -y$1');

  return out;
}

export interface ScaffoldRequest {
  /** Folder the project is created in (also its name) */
  name: string;
  command: string;
}

/**
 * "create a NextJS project named cero-test", "make a new next.js app called blog": the project
 * name is given and nothing else was asked, so the recommended defaults answer every question.
 * Null for anything it does not recognise.
 */
export function planScaffold(clause: string): ScaffoldRequest | null {
  const c = clause.trim().replace(/[.!]+$/, '');
  const m = c.match(/^(?:please\s+)?(?:create|make|scaffold|set\s*up|setup|init(?:iali[sz]e)?|start|generate|bootstrap)\s+(?:me\s+)?(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:next(?:\.?\s?js)?)\s+(?:project|app|application|site|website)\b(.*)$/i);
  if (!m) return null;
  const rest = m[1];
  const named = rest.match(/\b(?:named|called)\s+["'`]?([\w.@-]+)["'`]?/i);
  if (!named) return null;
  const name = named[1].replace(/\.+$/, '');
  // npm package names: lower case, no leading dot or underscore (create-next-app refuses others)
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) return null;
  return { name, command: `npx --yes create-next-app@latest ${name} --yes` };
}
