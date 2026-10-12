import { AutocompleteContext, AutocompleteSuggestion, IAutocompleteProvider } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Autocomplete provider that provides context-aware command suggestions
 * based on the active directory's manifest files (Node, Rust, Python, ROS, Docker).
 */
export class WorkspaceContextProvider implements IAutocompleteProvider {
  id = 'WorkspaceContextProvider';
  enabled = true;

  public async getSuggestions(context: AutocompleteContext): Promise<AutocompleteSuggestion[]> {
    const input = context.currentInput.trim();
    if (!input || !context.cwd) return [];

    const cwd = context.cwd === '~' ? (process.env.HOME || '') : context.cwd;
    if (!cwd) return [];

    const suggestions: AutocompleteSuggestion[] = [];
    const lowerInput = input.toLowerCase();

    const candidateCommands: { command: string; desc: string }[] = [];

    try {
      // 1. Check Node.js package.json
      const pkgPath = path.join(cwd, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const content = fs.readFileSync(pkgPath, 'utf8');
          const pkg = JSON.parse(content);
          if (pkg.scripts) {
            Object.keys(pkg.scripts).forEach((script) => {
              candidateCommands.push({
                command: `npm run ${script}`,
                desc: `Node script: ${pkg.scripts[script]}`
              });
            });
          }
        } catch { /* ignore malformed json */ }
        candidateCommands.push({ command: 'npm test', desc: 'Run test suite' });
        candidateCommands.push({ command: 'npm install', desc: 'Install project dependencies' });
      }

      // 2. Check Rust Cargo.toml
      if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
        candidateCommands.push({ command: 'cargo build', desc: 'Build Rust binaries' });
        candidateCommands.push({ command: 'cargo run', desc: 'Run main Rust binary' });
        candidateCommands.push({ command: 'cargo test', desc: 'Run Rust unit tests' });
        candidateCommands.push({ command: 'cargo check', desc: 'Analyze Rust code for compiler errors' });
      }

      // 3. Check Python manifests
      if (
        fs.existsSync(path.join(cwd, 'requirements.txt')) ||
        fs.existsSync(path.join(cwd, 'pyproject.toml')) ||
        fs.existsSync(path.join(cwd, 'setup.py'))
      ) {
        if (fs.existsSync(path.join(cwd, 'venv', 'bin', 'activate'))) {
          candidateCommands.push({ command: 'source venv/bin/activate', desc: 'Activate local virtual environment' });
        } else if (fs.existsSync(path.join(cwd, '.venv', 'bin', 'activate'))) {
          candidateCommands.push({ command: 'source .venv/bin/activate', desc: 'Activate local virtual environment' });
        }
        candidateCommands.push({ command: 'pytest', desc: 'Run Python test runner' });
        candidateCommands.push({ command: 'pip install -r requirements.txt', desc: 'Install Python requirements' });
      }

      // 4. Check Docker Compose
      if (fs.existsSync(path.join(cwd, 'docker-compose.yml')) || fs.existsSync(path.join(cwd, 'docker-compose.yaml'))) {
        candidateCommands.push({ command: 'docker compose up -d', desc: 'Start containers in background' });
        candidateCommands.push({ command: 'docker compose down', desc: 'Stop and remove containers' });
        candidateCommands.push({ command: 'docker compose logs -f', desc: 'Follow container log stream' });
      }

      // 5. Check ROS 2 / Colcon
      if (fs.existsSync(path.join(cwd, 'install', 'setup.bash'))) {
        candidateCommands.push({ command: 'source install/setup.bash', desc: 'Source ROS 2 workspace overlay' });
      }
      if (fs.existsSync(path.join(cwd, 'src'))) {
        candidateCommands.push({ command: 'colcon build --symlink-install', desc: 'Build ROS 2 colcon workspace' });
      }

      // 6. Check Makefile
      if (fs.existsSync(path.join(cwd, 'Makefile'))) {
        candidateCommands.push({ command: 'make', desc: 'Execute default Makefile target' });
        candidateCommands.push({ command: 'make test', desc: 'Run Makefile test target' });
      }
    } catch {
      // In browser or mock environment without direct fs access, fallback
    }

    for (const c of candidateCommands) {
      if (c.command.toLowerCase().startsWith(lowerInput) && c.command.toLowerCase() !== lowerInput) {
        suggestions.push({
          id: `ws_${c.command.replace(/\s+/g, '_')}`,
          value: c.command,
          displayText: c.command,
          description: c.desc,
          category: 'Shell',
          priority: 88,
          confidence: 0.88,
          sourceProvider: this.id
        });
      }
    }

    return suggestions;
  }
}
