/**
 * DecisionCall.ts — Extracted LLM Decision Call Builder
 * 
 * Prepares structured chat messages and GenerateOptions for the agent loop
 * and for evaluation scripts (Task 3.1) so evaluation runs the real decision
 * path rather than an out-of-sync prompt copy.
 */

import { buildSystemPrompt, STANDARD_TOOL_SPECS, ToolSpec } from './SystemPrompt';
import { GbnfGrammarManager } from '../models/GbnfGrammarManager';
import { TldrKnowledgeEngine } from '../../domain/knowledge/TldrKnowledgeEngine';
import { GenerateOptions } from '../provider/Provider';
import { AgentRunContext } from './AgentLoop';
import { fitMessages, getContextTokens, RESERVED_FOR_REPLY } from './ContextBudget';

export interface DecisionCallResult {
  systemPrompt: string;
  fullPrompt: string;
  messages: { role: string; content: string }[];
  options: GenerateOptions;
}

export function formatConversationPrompt(systemPrompt: string, messages: { role: string; content: string }[]): string {
  let prompt = systemPrompt + '\n\n';
  for (const msg of messages) {
    if (msg.role === 'user') {
      prompt += `User: ${msg.content}\n`;
    } else if (msg.role === 'assistant') {
      prompt += `Assistant: ${msg.content}\n`;
    } else if (msg.role === 'tool') {
      prompt += `<TOOL_OUTPUT>\n${msg.content}\n</TOOL_OUTPUT>\n`;
    }
  }
  prompt += 'Assistant: ';
  return prompt;
}

export function buildDecisionCall(
  goal: string,
  context: AgentRunContext,
  history: { role: string; content: string }[] = [],
  extra?: {
    systemPrompt?: string;
    toolSpecs?: ToolSpec[];
    stageContext?: string;
    mode?: 'decision' | 'chat';
    messages?: { role: string; content: string }[];
    isPlanner?: boolean;
    maxTokens?: number;
  }
): DecisionCallResult {
  let systemPrompt = extra?.systemPrompt;
  if (!systemPrompt) {
    const tools = extra?.toolSpecs || STANDARD_TOOL_SPECS;
    systemPrompt = buildSystemPrompt(tools, context, goal);
    if (extra?.stageContext) {
      systemPrompt += `\n\n[STAGE CONTEXT & PRECONDITIONS]\n${extra.stageContext}\n`;
    }
    const words = goal.toLowerCase().split(/[\s,;:.!?]+/);
    for (const word of words) {
      const cleanWord = word.trim();
      if (cleanWord.length > 2 && TldrKnowledgeEngine.getInstance().hasCommand(cleanWord)) {
        const exemplar = TldrKnowledgeEngine.getInstance().formatFewShotExemplar(cleanWord, context.os);
        if (exemplar) {
          systemPrompt += `\n\n${exemplar}`;
          break;
        }
      }
    }
  }

  const rawConversationMessages: { role: string; content: string }[] = extra?.messages || [
    ...history,
    { role: 'user', content: goal }
  ];

  // Fit messages strictly into token budget to prevent context overflow (Task 3.3)
  const fitted = fitMessages(systemPrompt, rawConversationMessages, getContextTokens() - RESERVED_FOR_REPLY);
  const chatMessages = fitted.messages;
  const conversationForPrompt = chatMessages.filter(m => m.role !== 'system');
  const fullPrompt = formatConversationPrompt(systemPrompt, conversationForPrompt);

  const isChat = extra?.mode === 'chat';
  const defaultMaxTokens = isChat ? 512 : (extra?.isPlanner ? 1024 : 400);
  const options: GenerateOptions = {
    temperature: isChat ? 0.4 : 0,
    topK: isChat ? 20 : 1,
    topP: isChat ? 0.9 : 1,
    seed: isChat ? undefined : 42,
    maxTokens: extra?.maxTokens ?? defaultMaxTokens,
    format: 'json',
    messages: chatMessages,
    grammar: GbnfGrammarManager.getGrammar('SENTINEL_ACTION'),
    grammarJsonSchema: GbnfGrammarManager.SENTINEL_ACTION_JSON_SCHEMA,
    sessionId: context.sessionId || 'default-session',
    requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    signal: context.signal,
    mode: extra?.mode ?? 'decision'
  };

  return {
    systemPrompt,
    fullPrompt,
    messages: chatMessages,
    options
  };
}
