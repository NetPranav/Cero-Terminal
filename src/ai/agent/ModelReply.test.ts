import { describe, it, expect } from 'vitest';
import { parseModelReply, repairJson, stripThinking } from './ModelReply';

const SHELL = { action: 'tool', tool: 'shell.execute', params: { command: 'ls -la', explanation: 'List files' } };
const ok = (raw: string, opts?: { finishedByLength?: boolean }) => {
  const r = parseModelReply(raw, opts);
  if (!r.ok) throw new Error(`not parsed: ${r.reason} for ${raw}`);
  return r.value;
};

describe('parseModelReply: the same action from every format', () => {
  it('plain JSON', () => {
    expect(ok('{"action":"execute","command":"ls -la","explanation":"List files"}')).toEqual(SHELL);
  });
  it('a fenced block', () => {
    expect(ok('```json\n{"action":"execute","command":"ls -la","explanation":"List files"}\n```')).toEqual(SHELL);
  });
  it('a fenced block with prose around it', () => {
    expect(ok('Sure, here you go:\n```json\n{"command":"ls -la","explanation":"List files"}\n```\nHope that helps!')).toEqual(SHELL);
  });
  it('prose before and after one object', () => {
    expect(ok('I will list the files. {"action":"execute","command":"ls -la","explanation":"List files"} Done.')).toEqual(SHELL);
  });
  it('think tags, closed and unclosed', () => {
    expect(ok('<think>the user wants files</think>{"command":"ls -la","explanation":"List files"}')).toEqual(SHELL);
    expect(stripThinking('<think>never ends')).toBe('');
  });
  it('{"tool", "params"}', () => {
    expect(ok('{"tool":"shell.execute","params":{"command":"ls -la","explanation":"List files"}}')).toEqual(SHELL);
  });
  it('{"action","arguments"} with a tool name', () => {
    const v = ok('{"action":"filesystem.search","arguments":{"query":"a"}}');
    expect(v).toMatchObject({ action: 'tool', tool: 'filesystem.search', params: { query: 'a' } });
  });
  it('arguments as a JSON string', () => {
    const v = ok('{"tool":"filesystem.search","arguments":"{\\"query\\":\\"a\\"}"}');
    expect(v.params).toEqual({ query: 'a' });
  });
  it('a native tool call (OpenAI style, arguments as a string)', () => {
    const v = ok(JSON.stringify({ tool_calls: [{ type: 'function', function: { name: 'shell.execute', arguments: '{"command":"ls -la","explanation":"List files"}' } }] }));
    expect(v).toEqual(SHELL);
  });
  it('a whole chat-completion reply', () => {
    const v = ok(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ function: { name: 'shell.execute', arguments: '{"command":"ls -la","explanation":"List files"}' } }] } }] }));
    expect(v).toEqual(SHELL);
  });
  it('a done answer with a different field name', () => {
    expect(ok('{"response":"It is sunny."}')).toMatchObject({ action: 'done', summary: 'It is sunny.' });
    expect(ok('{"action":"done","summary":"Done."}')).toMatchObject({ action: 'done', summary: 'Done.' });
  });
  it('a trailing comma', () => {
    const r = parseModelReply('{"action":"execute","command":"ls -la","explanation":"List files",}');
    expect(r.ok && r.repaired).toBe(true);
    expect(r.ok && r.value).toEqual(SHELL);
  });
  it('single quotes', () => {
    expect(ok("{'action':'execute','command':'ls -la','explanation':'List files'}")).toEqual(SHELL);
  });
  it('a reply cut off at the token limit', () => {
    const v = ok('{"action":"execute","command":"ls -la","explanation":"List fil', { finishedByLength: true });
    expect(v.params?.command).toBe('ls -la');
  });
  it('a cut-off reply is not guessed at when it was not cut by the limit', () => {
    expect(parseModelReply('{"action":"execute","command":"ls -la","explanation":"List fil').ok).toBe(false);
  });
  it('a one-element array', () => {
    expect(ok('[{"action":"execute","command":"ls -la","explanation":"List files"}]')).toEqual(SHELL);
  });
});

describe('parseModelReply: clear failures', () => {
  it('says why', () => {
    expect(parseModelReply('')).toEqual({ ok: false, reason: 'empty reply' });
    expect(parseModelReply('<think>hmm</think>')).toMatchObject({ ok: false });
    expect(parseModelReply('I cannot do that.')).toMatchObject({ ok: false, reason: 'no usable JSON in the reply' });
    expect(parseModelReply('{"foo":1}')).toMatchObject({ ok: false });
  });
  it('repairJson closes open strings and brackets', () => {
    expect(JSON.parse(repairJson('{"a":["x","y'))).toEqual({ a: ['x', 'y'] });
  });
});
