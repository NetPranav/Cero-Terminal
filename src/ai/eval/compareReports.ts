/**
 * compareReports.ts: line two evaluation reports up case by case.
 *
 * The reference report (usually an API model, run once) against the report under test (usually the
 * built-in model, run ten times). A case is a gap when the reference passes it and the other is
 * below `threshold` (default 80%).
 */
export interface EvalCaseResult { caseId: string; prompt?: string; runs: number; passes: number }
export interface EvalReport { model: string; results: EvalCaseResult[] }

export interface ComparedCase {
  caseId: string;
  reference: string;
  other: string;
  gap: boolean;
}

const rate = (r: EvalCaseResult) => (r.runs > 0 ? r.passes / r.runs : 0);

export function compareReports(reference: EvalReport, other: EvalReport, threshold = 0.8): { rows: ComparedCase[]; gaps: ComparedCase[] } {
  const otherById = new Map(other.results.map(r => [r.caseId, r]));
  const rows: ComparedCase[] = [];
  for (const ref of [...reference.results].sort((a, b) => a.caseId.localeCompare(b.caseId))) {
    const o = otherById.get(ref.caseId);
    if (!o) continue;
    rows.push({
      caseId: ref.caseId,
      reference: `${ref.passes}/${ref.runs}`,
      other: `${o.passes}/${o.runs}`,
      gap: rate(ref) >= 0.5 && rate(o) < threshold,
    });
  }
  return { rows, gaps: rows.filter(r => r.gap) };
}

export function formatComparison(reference: EvalReport, other: EvalReport, threshold = 0.8): string {
  const { rows, gaps } = compareReports(reference, other, threshold);
  const lines = [`case | ${reference.model} | ${other.model}`, '--- | --- | ---', ...rows.map(r => `${r.caseId} | ${r.reference} | ${r.other}${r.gap ? '  <- gap' : ''}`)];
  lines.push('', gaps.length ? `${gaps.length} case(s) where ${reference.model} passes and ${other.model} is below ${Math.round(threshold * 100)}%.` : 'No gaps.');
  return lines.join('\n');
}
