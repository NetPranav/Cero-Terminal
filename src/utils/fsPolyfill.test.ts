import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as shim from './fsPolyfill';

describe('fsPolyfill (webview fs backed by ~/.sentinel)', () => {
  const calls: [string, any][] = [];
  const invoke = vi.fn(async (cmd: string, args?: any) => {
    calls.push([cmd, args]);
    if (cmd === 'sentinel_store_snapshot') {
      return { home: '/home/u', files: { 'learning/knowledge_deficits.jsonl': '{"id":"d1"}\n', 'models/manifest.json': '{"schemaVersion":1}' } };
    }
    return undefined;
  }) as any;

  beforeEach(async () => {
    calls.length = 0;
    shim.__resetSentinelStore();
    await shim.hydrateSentinelStore(invoke);
  });

  it('serves reads for ~/.sentinel paths regardless of the home prefix a store computed', () => {
    // Stores compute "/tmp" as home in the webview because `process` does not exist there
    expect(shim.existsSync('/tmp/.sentinel/learning/knowledge_deficits.jsonl')).toBe(true);
    expect(shim.readFileSync('/home/u/.sentinel/learning/knowledge_deficits.jsonl')).toBe('{"id":"d1"}\n');
    expect(shim.existsSync('/home/u/.sentinel/learning')).toBe(true);
    expect(shim.readdirSync('/home/u/.sentinel/models')).toEqual(['manifest.json']);
  });

  it('persists writes and appends through the confined Rust commands', () => {
    shim.writeFileSync('/tmp/.sentinel/training/sentinel_dpo_pairs.jsonl', 'a\n');
    shim.appendFileSync('/tmp/.sentinel/training/sentinel_dpo_pairs.jsonl', 'b\n');
    expect(shim.readFileSync('/x/.sentinel/training/sentinel_dpo_pairs.jsonl')).toBe('a\nb\n');
    expect(calls).toContainEqual(['sentinel_store_write', { relativePath: 'training/sentinel_dpo_pairs.jsonl', contents: 'a\n' }]);
    expect(calls).toContainEqual(['sentinel_store_append', { relativePath: 'training/sentinel_dpo_pairs.jsonl', contents: 'b\n' }]);
  });

  it('ignores paths outside ~/.sentinel and rejects traversal', () => {
    shim.writeFileSync('/etc/passwd', 'x');
    expect(shim.existsSync('/etc/passwd')).toBe(false);
    expect(shim.sentinelRelativePath('/home/u/.sentinel/../.ssh/id_rsa')).toBeNull();
    expect(calls.filter(([cmd]) => cmd !== 'sentinel_store_snapshot')).toEqual([]);
  });
});
