/**
 * appPathProbe.ts: the real file access for PathResolver (Tauri commands). Tests pass their own probe.
 */
import type { FoundPath, PathProbe } from './PathResolver';
import { flowFolders } from '../../workflows/flow/FlowStore';

export const appPathProbe: PathProbe = {
  home: '',
  async exists(path) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<boolean>('check_path_exists', { path });
  },
  async find(o) {
    const { invoke } = await import('@tauri-apps/api/core');
    const rows = await invoke<Array<{ path: string; name: string; is_dir: boolean }>>('find_paths', {
      query: o.query, roots: o.roots, kind: o.kind, maxDepth: o.maxDepth, limit: o.limit,
    });
    return rows.map((r): FoundPath => ({ path: r.path, name: r.name, isDir: r.is_dir }));
  },
};

/** The probe with the home folder filled in */
export async function resolveAppProbe(): Promise<PathProbe> {
  const { home } = await flowFolders();
  return { ...appPathProbe, home };
}
