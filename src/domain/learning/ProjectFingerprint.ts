/**
 * ProjectFingerprint.ts — Workspace & Project Identification Scoping
 * 
 * Part of Phase 0.5 (Roadmap item 0.5.4):
 * Scopes episodic memory and learned patterns per project rather than globally.
 * Computes a deterministic fingerprint from:
 *  - Node: package.json name
 *  - Rust: Cargo.toml package name / root
 *  - Go: go.mod module name
 *  - Python: pyproject.toml / requirements.txt
 *  - Git: .git directory or remote repository origin
 */

import * as path from 'path';
import * as fs from 'fs';

export type ProjectType = 'node' | 'rust' | 'go' | 'python' | 'git' | 'global' | 'generic';

export interface ProjectFingerprintResult {
  fingerprint: string;
  projectType: ProjectType;
  rootPath: string;
}

export class ProjectFingerprint {
  /**
   * Computes a project fingerprint for the given directory path.
   */
  public static compute(cwd?: string): ProjectFingerprintResult {
    if (!cwd || cwd === '/' || cwd === '~') {
      return { fingerprint: 'global', projectType: 'global', rootPath: '/' };
    }
    const targetDir = cwd;

    try {
      let curr = path.resolve(targetDir);
      const home = (typeof process !== 'undefined' && process.env?.HOME) ? path.resolve(process.env.HOME) : '';

      // Traverse upwards to locate nearest project boundary
      while (curr && curr !== '/' && curr !== home) {
        // 1. Node.js
        const pkgJson = path.join(curr, 'package.json');
        if (fs.existsSync(pkgJson)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
            const name = (parsed.name || path.basename(curr)).replace(/[^a-zA-Z0-9_-]/g, '_');
            return { fingerprint: `node_${name}`, projectType: 'node', rootPath: curr };
          } catch {
            return { fingerprint: `node_${path.basename(curr)}`, projectType: 'node', rootPath: curr };
          }
        }

        // 2. Rust
        const cargoToml = path.join(curr, 'Cargo.toml');
        if (fs.existsSync(cargoToml)) {
          return { fingerprint: `rust_${path.basename(curr)}`, projectType: 'rust', rootPath: curr };
        }

        // 3. Go
        const goMod = path.join(curr, 'go.mod');
        if (fs.existsSync(goMod)) {
          return { fingerprint: `go_${path.basename(curr)}`, projectType: 'go', rootPath: curr };
        }

        // 4. Python
        if (fs.existsSync(path.join(curr, 'pyproject.toml')) || fs.existsSync(path.join(curr, 'requirements.txt'))) {
          return { fingerprint: `python_${path.basename(curr)}`, projectType: 'python', rootPath: curr };
        }

        // 5. Git repository
        const gitDir = path.join(curr, '.git');
        if (fs.existsSync(gitDir)) {
          return { fingerprint: `git_${path.basename(curr)}`, projectType: 'git', rootPath: curr };
        }

        const parent = path.dirname(curr);
        if (parent === curr) break;
        curr = parent;
      }
    } catch {
      // In-memory / mocked fallback
    }

    // Fallback: sanitized directory basename
    const base = path.basename(targetDir).replace(/[^a-zA-Z0-9_-]/g, '_');
    return {
      fingerprint: base ? `generic_${base}` : 'global',
      projectType: 'generic',
      rootPath: targetDir
    };
  }

  public static sanitize(id: string): string {
    return (id || 'global').replace(/[^a-zA-Z0-9_-]/g, '_');
  }
}
