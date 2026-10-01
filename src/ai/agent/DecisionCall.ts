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

  const conversationMessages: { role: string; content: string }[] = extra?.messages || [
    ...history,
    { role: 'user', content: goal }
  ];

  const fullPrompt = formatConversationPrompt(systemPrompt, conversationMessages);

  const chatMessages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
    ...conversationMessages
  ];

  const options: GenerateOptions = {
    temperature: 0.05,
    maxTokens: 512,
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
