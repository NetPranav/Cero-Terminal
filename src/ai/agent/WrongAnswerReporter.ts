/**
 * WrongAnswerReporter.ts — Formats and copies AI incorrect answers as cases.json test cases
 *
 * Allows users to report any wrong or unexpected AI answer directly to clipboard
 * formatted as a standard test case for scripts/eval/cases.json.
 */

export interface WrongAnswerCase {
  id: string;
  prompt: string;
  model?: string;
  expect: {
    tool: string;
    must_include?: string[];
    must_not_include: string[];
  };
}

export function formatWrongAnswerCase(
  prompt: string,
  modelName: string,
  chosenAction: any
): string {
  // Strip any accidental secrets, passwords, or tokens from prompt and action
  const cleanPrompt = (prompt || '').replace(/(?:password|token|secret|key)=\S+/gi, '$1=[REDACTED]').trim();
  const slug = cleanPrompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'case';

  const actionText = typeof chosenAction === 'string'
    ? chosenAction
    : chosenAction?.params?.command || chosenAction?.command || chosenAction?.tool || '';

  const cleanAction = String(actionText)
    .replace(/(?:password|token|secret|key)=\S+/gi, '$1=[REDACTED]')
    .trim()
    .slice(0, 100);

  const caseObj: WrongAnswerCase = {
    id: `reported-${slug}-${Date.now().toString(36)}`,
    prompt: cleanPrompt,
    model: modelName,
    expect: {
      tool: 'execute',
      must_include: cleanAction ? [cleanAction.split(/\s+/)[0]] : [],
      must_not_include: ['rm -rf', 'sudo']
    }
  };

  return JSON.stringify(caseObj, null, 2);
}

/**
 * Copy wrong answer case to clipboard via Tauri plugin or browser clipboard API.
 */
export async function copyWrongAnswerToClipboard(
  prompt: string,
  modelName: string,
  chosenAction: any
): Promise<boolean> {
  const json = formatWrongAnswerCase(prompt, modelName, chosenAction);
  try {
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(json);
      return true;
    }
  } catch {
    // fall through to web clipboard
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json);
      return true;
    }
  } catch {
    // Clipboard write blocked
  }

  return false;
}
