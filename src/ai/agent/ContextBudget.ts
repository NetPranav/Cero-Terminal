/**
 * ContextBudget.ts — Token Budgeting & Message Fitting for Cero AI
 * 
 * Prevents context overflow in embedded (llama.cpp) and external models by
 * strictly fitting system prompt, history, and user requests within bounds.
 */

export const CONTEXT_TOKENS = 8192; // Default context size matching -c in embedded_server.rs
export const RESERVED_FOR_REPLY = 700;

let currentContextTokens = CONTEXT_TOKENS;

export function getContextTokens(): number {
  return currentContextTokens;
}

export function setContextTokens(tokens: number): void {
  if (typeof tokens === 'number' && tokens > 0) {
    currentContextTokens = tokens;
  }
}

export interface Msg {
  role: string;
  content: string;
  [key: string]: any;
}

/**
 * Estimate token count for code-heavy and prompt text.
 * ~3.2 characters per token is standard for code/JSON/shell prompts.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.2);
}

/**
 * Trim large tool output / observation strings:
 * keep first 600 characters and last 400 characters.
 */
export function trimToolOutput(text: string): string {
  if (text.length <= 1100) return text;
  const head = text.slice(0, 600);
  const tail = text.slice(-400);
  const removed = text.length - 1000;
  return `${head}\n[... ${removed} characters removed ...]\n${tail}`;
}

/**
 * Fits system prompt and history into budget:
 * 1. Keeps system prompt whole.
 * 2. Always keeps the newest user message.
 * 3. Trims oversized old tool outputs / observations.
 * 4. Fills remaining budget with history from newest to oldest.
 */
export function fitMessages(
  system: string,
  history: Msg[],
  budget: number = currentContextTokens - RESERVED_FOR_REPLY
): { messages: Msg[]; dropped: number } {
  const systemTokens = estimateTokens(system);
  let availableBudget = Math.max(0, budget - systemTokens);

  if (history.length === 0) {
    return {
      messages: [{ role: 'system', content: system }],
      dropped: 0
    };
  }

  // Identify newest message (must always be kept)
  const lastIndex = history.length - 1;
  const newestMsg = history[lastIndex];
  let newestContent = newestMsg.content;
  // If newest message itself is a tool observation that is gigantic, trim it
  if (newestMsg.role === 'tool' || newestMsg.role === 'assistant') {
    newestContent = trimToolOutput(newestContent);
  }
  const newestTokens = estimateTokens(newestContent);
  availableBudget -= newestTokens;

  // Process remaining history from newest to oldest
  const keptRemaining: Msg[] = [];
  let dropped = 0;

  for (let i = lastIndex - 1; i >= 0; i--) {
    const item = history[i];
    let content = item.content;
    // Trim older tool observations/outputs aggressively
    if (content.length > 1000) {
      content = trimToolOutput(content);
    }

    const itemTokens = estimateTokens(content);
    if (availableBudget >= itemTokens) {
      availableBudget -= itemTokens;
      keptRemaining.unshift({ ...item, content });
    } else {
      dropped++;
    }
  }

  const finalMessages: Msg[] = [
    { role: 'system', content: system },
    ...keptRemaining,
    { ...newestMsg, content: newestContent }
  ];

  return {
    messages: finalMessages,
    dropped
  };
}
