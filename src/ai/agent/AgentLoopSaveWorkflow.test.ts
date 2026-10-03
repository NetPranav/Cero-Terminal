import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { AgentLoop } from './AgentLoop';
import { DiskWorkflowStorage } from '../../workflows/storage/DiskWorkflowStorage';
import { setChoiceHandlerForTests } from '../../presentation/ChoiceRequests';
import { planFlowFile } from '../../workflows/flow/FlowPlan';

describe('Saving a workflow from inside a prompt', () => {
  let tmpDir: string;
  let files: Map<string, string>;
  let loop: AgentLoop;
  let execute: ReturnType<typeof vi.fn>;
  let generate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cero-save-intent-'));
    DiskWorkflowStorage.getInstance().setCustomBaseDir(tmpDir);
    files = new Map();
    generate = vi.fn().mockResolvedValue('Mock answer');
    loop = new AgentLoop({ toolIndex: { has: () => false, getAll: () => [] } } as any, {
      getActiveProvider: () => ({ name: 'mock', isAvailable: vi.fn().mockResolvedValue(true), generate }),
      getActiveModel: () => ({ modelId: 'mock' }),
      initialize: vi.fn(),
    } as any);
    execute = vi.fn().mockResolvedValue({ success: true, data: { stdout: '', code: 0 } });
    (loop as any).toolExecutor = { hasDriver: () => true, execute };
    loop.setFlowIO({ exists: async p => files.has(p), write: async (p, t) => { files.set(p, t); } });
  });

  afterEach(() => {
    setChoiceHandlerForTests(null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const ctx = { os: 'linux', cwd: '/tmp/work' };

  it('open an app and save it: one app action, the summary names the path', async () => {
    const asked: string[] = [];
    setChoiceHandlerForTests(async req => { asked.push(req.title); return { index: 0 }; });
    const r = await loop.run('open spotify and save this as a workflow called my music', ctx);
    expect(r.success).toBe(true);
    expect(asked).toEqual(['Save "my music" as a .flow file']);
    const [file] = [...files.keys()];
    expect(file).toMatch(/Desktop[\\/]my-music\.flow$/);
    const doc = JSON.parse(files.get(file)!);
    expect(doc.actions).toEqual([{ type: 'app', app: expect.stringMatching(/spotify/i) }]);
    expect(r.summary).toContain('Saved workflow "my music" (1 step) to ');
    expect(r.summary).toContain(file);
    for (const target of ['macos', 'windows', 'linux'] as const) {
      expect(planFlowFile(files.get(file)!, file, target)?.steps.length).toBe(1);
    }
  });

  it('without a name, asks for one and uses the answer', async () => {
    const asked: string[] = [];
    setChoiceHandlerForTests(async req => {
      asked.push(req.title);
      return req.title === 'Name this workflow' ? { custom: 'Daily music' } : { index: 0 };
    });
    const r = await loop.run('open spotify and save this as a workflow', ctx);
    expect(asked[0]).toBe('Name this workflow');
    expect([...files.keys()][0]).toMatch(/daily-music\.flow$/);
    expect(r.summary).toContain('Saved workflow "Daily music"');
  });

  it('skips the where-to-save question when the prompt says where', async () => {
    const asked: string[] = [];
    setChoiceHandlerForTests(async req => { asked.push(req.title); return { index: 0 }; });
    await loop.run('open spotify and save it as a workflow called music on the desktop', ctx);
    expect(asked).toEqual([]);
    expect([...files.keys()][0]).toMatch(/Desktop[\\/]music\.flow$/);
  });

  it('a failing task saves nothing and says so', async () => {
    execute.mockResolvedValue({ success: false, error: 'not found' });
    setChoiceHandlerForTests(async () => ({ index: 0 }));
    const r = await loop.run('open spotify and save this as a workflow called music', ctx);
    expect(files.size).toBe(0);
    expect(r.summary).toContain('Not saved: the task failed');
  });

  it('declining the dialog says "you chose not to"', async () => {
    setChoiceHandlerForTests(async () => null);
    const r = await loop.run('open spotify and save this as a workflow called music', ctx);
    expect(files.size).toBe(0);
    expect(r.summary).toContain('Not saved: you chose not to.');
  });

  it('with no screen to ask on, still saves into the Cero workflows folder and reports the path', async () => {
    const r = await loop.run('open spotify and save this as a workflow called music', ctx);
    expect(r.summary).toContain(`Saved workflow "music" (1 step) to ${path.join(tmpDir, 'music.flow')}`);
    expect(fs.existsSync(path.join(tmpDir, 'music.flow'))).toBe(true);
  });

  it('an answer-only task reports why nothing was saved', async () => {
    const r = await loop.run('what is the capital of france and save this as a workflow called trivia', ctx);
    expect(r.summary).toMatch(/Not saved: /);
  });

  it('talk about workflows runs normally and writes nothing', async () => {
    await loop.run('how do I save a workflow?', ctx);
    expect(files.size).toBe(0);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });

  it('save with nothing earlier in the session says so instead of staying silent', async () => {
    const r = await loop.run('save this as a workflow called nothing', { ...ctx, sessionId: 'fresh-session-xyz' });
    expect(r.success).toBe(false);
    expect(r.summary).toContain('Not saved: there are no earlier steps');
  });

  describe('a saved workflow can be found and used afterwards', () => {
    it('saved to the default place (Desktop): "run the workflow <name>" finds it and replays its steps', async () => {
      setChoiceHandlerForTests(async () => ({ index: 0 }));
      const saved = await loop.run('open spotify and save this as a workflow called my music', ctx);
      expect(saved.summary).toContain('Saved workflow "my music"');
      // physically on disk in the Cero workflows folder, not only wherever the copy went
      expect(fs.readdirSync(tmpDir).filter(f => f.endsWith('.flow'))).toEqual(['my_music.flow']);

      execute.mockClear();
      const ran = await loop.run('run the workflow my music', ctx);
      expect(ran.summary).not.toMatch(/No saved workflow/);
      expect(ran.success).toBe(true);
      expect(execute).toHaveBeenCalled();
    });

    it('is listed by "list my workflows"', async () => {
      setChoiceHandlerForTests(async () => ({ index: 0 }));
      await loop.run('open spotify and save this as a workflow called my music', ctx);
      const listed = await loop.run('list my workflows', ctx);
      expect(listed.summary).toMatch(/Saved workflows \(1\)[\s\S]*my.music/);
    });

    it('the phrase at the start of the prompt (the make-a-workflow route) is saved and found too', async () => {
      setChoiceHandlerForTests(async () => ({ index: 0 }));
      const r = await loop.run('save this as a workflow called quick and open spotify', ctx);
      expect(r.summary).toMatch(/^Saved /);
      expect(fs.existsSync(path.join(tmpDir, 'quick.flow'))).toBe(true);
      const ran = await loop.run('run the workflow quick', ctx);
      expect(ran.success).toBe(true);
    });
  });
});
