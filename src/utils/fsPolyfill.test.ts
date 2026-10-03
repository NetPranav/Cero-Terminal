import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as shim from './fsPolyfill';

describe('fsPolyfill (webview fs backed by ~/.cero)', () => {
  const calls: [string, any][] = [];
  const invoke = vi.fn(async (cmd: string, args?: any) => {
    calls.push([cmd, args]);
    if (cmd === 'cero_store_snapshot') {
      return { home: '/home/u', files: { 'learning/knowledge_deficits.jsonl': '{"id":"d1"}\n', 'models/manifest.json': '{"schemaVersion":1}' } };
    }
    return undefined;
  }) as any;

  beforeEach(async () => {
    calls.length = 0;
    shim.__resetCeroStore();
    await shim.hydrateCeroStore(invoke);
  });

  it('serves reads for ~/.cero paths regardless of the home prefix a store computed', () => {
    // Stores compute "/tmp" as home in the webview because `process` does not exist there
    expect(shim.existsSync('/tmp/.cero/learning/knowledge_deficits.jsonl')).toBe(true);
    expect(shim.readFileSync('/home/u/.cero/learning/knowledge_deficits.jsonl')).toBe('{"id":"d1"}\n');
    expect(shim.existsSync('/home/u/.cero/learning')).toBe(true);
    expect(shim.readdirSync('/home/u/.cero/models')).toEqual(['manifest.json']);
  });

  it('persists writes and appends through the confined Rust commands', () => {
    shim.writeFileSync('/tmp/.cero/training/cero_dpo_pairs.jsonl', 'a\n');
    shim.appendFileSync('/tmp/.cero/training/cero_dpo_pairs.jsonl', 'b\n');
    expect(shim.readFileSync('/x/.cero/training/cero_dpo_pairs.jsonl')).toBe('a\nb\n');
    expect(calls).toContainEqual(['cero_store_write', { relativePath: 'training/cero_dpo_pairs.jsonl', contents: 'a\n' }]);
    expect(calls).toContainEqual(['cero_store_append', { relativePath: 'training/cero_dpo_pairs.jsonl', contents: 'b\n' }]);
  });

  it('ignores paths outside ~/.cero and rejects traversal', () => {
    shim.writeFileSync('/etc/passwd', 'x');
    expect(shim.existsSync('/etc/passwd')).toBe(false);
    expect(shim.ceroRelativePath('/home/u/.cero/../.ssh/id_rsa')).toBeNull();
    expect(calls.filter(([cmd]) => cmd !== 'cero_store_snapshot')).toEqual([]);
  });
});
