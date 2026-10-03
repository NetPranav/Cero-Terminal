/**
 * WorkflowRequest.ts — "run the workflow in deploy.flow", "run my nightly workflow".
 *
 * A headless run showed the model trying to execute a workflow's JSON file as a program. These
 * requests are parsed here and handed to AgentLoop.runWorkflow, which previews every step in one
 * confirmation and runs long steps in their own panes.
 */

export type WorkflowRequest =
  | { kind: 'file'; path: string }
  | { kind: 'name'; name: string };

const RUN = String.raw`(?:run|execute|start|replay|play|launch)`;
const FILE = String.raw`["'\`]?([^\s"'\`]+\.(?:flow|json))["'\`]?`;

export function parseWorkflowRequest(goal: string): WorkflowRequest | null {
  const text = goal.trim().replace(/\s+/g, ' ').replace(/[.!]+$/, '');
  let m = text.match(new RegExp(`^${RUN}\\s+(?:the\\s+)?(?:saved\\s+)?(?:workflow|flow|macro)(?:\\s+file)?\\s+(?:in|from|at|saved\\s+in|stored\\s+in)?\\s*${FILE}$`, 'i'))
    || text.match(new RegExp(`^${RUN}\\s+(?:the\\s+)?${FILE}\\s+(?:workflow|flow)(?:\\s+file)?$`, 'i'))
    || text.match(new RegExp(`^${RUN}\\s+["'\`]?([^\\s"'\`]+\\.flow)["'\`]?$`, 'i'));
  if (m) return { kind: 'file', path: m[1] };
  m = text.match(new RegExp(`^${RUN}\\s+(?:the\\s+|my\\s+)?(?:saved\\s+)?(?:workflow|macro)\\s+(?:called\\s+|named\\s+)?["'\`]?([\\w .@-]{1,60}?)["'\`]?$`, 'i'))
    || text.match(new RegExp(`^${RUN}\\s+(?:the\\s+|my\\s+)?["'\`]?([\\w.@-]+(?:\\s[\\w.@-]+){0,3}?)["'\`]?\\s+(?:workflow|macro)$`, 'i'));
  if (m && !/^(?:a|the|this|that|it|new)$/i.test(m[1].trim())) return { kind: 'name', name: m[1].trim() };
  return null;
}

/** Saved workflows whose name matches what the user said (exact first, then loose). */
export function matchWorkflowNames(said: string, names: string[]): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, '');
  const target = norm(said);
  const exact = names.filter(n => norm(n) === target);
  if (exact.length) return exact;
  return names.filter(n => norm(n).includes(target) || target.includes(norm(n)));
}
