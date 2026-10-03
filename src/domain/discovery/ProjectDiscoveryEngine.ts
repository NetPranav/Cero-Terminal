/**
 * Cero — Project & Environment Discovery Engine
 *
 * Scans development workspaces for project manifests (ROS 1/2, Node, Python,
 * Rust, Docker) to enable intelligent "Probe & Disambiguate" capabilities.
 * Prevents blind command failures and generates clean environment sourcing plans.
 */

import * as fs from 'fs';
import * as path from 'path';

export type ProjectType = 'ros2' | 'ros1' | 'node' | 'python' | 'rust' | 'docker' | 'generic';

export interface DiscoveredProject {
  id: string; // "1", "2", "3"
  name: string;
  path: string;
  type: ProjectType;
  launchTarget?: string;
  setupScript?: string;
  description?: string;
  confidence: number;
}

export interface DiscoveryProbeResult {
  keyword: string;
  matches: DiscoveredProject[];
  disambiguationRequired: boolean;
  disambiguationPrompt?: string;
}

export interface FileSystemScanner {
  readdir: (dir: string) => Promise<string[]>;
  stat: (filePath: string) => Promise<{ isDirectory: () => boolean }>;
  readFile: (filePath: string) => Promise<string>;
  exists: (filePath: string) => Promise<boolean>;
}

export class ProjectDiscoveryEngine {
  /**
   * Fast default filesystem adapter wrapping Node fs
   */
  private static defaultScanner: FileSystemScanner = {
    readdir: async (dir) => {
      try {
        return fs.promises.readdir(dir);
      } catch {
        return [];
      }
    },
    stat: async (p) => {
      try {
        return fs.promises.stat(p);
      } catch {
        return { isDirectory: () => false };
      }
    },
    readFile: async (p) => {
      try {
        return fs.promises.readFile(p, 'utf-8');
      } catch {
        return '';
      }
    },
    exists: async (p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    }
  };

  /**
   * Probe filesystem roots for projects matching a target keyword (e.g. "gazebo", "navigation", "backend").
   */
  public static async probe(
    keyword: string,
    searchRoots: string[],
    scanner: FileSystemScanner = this.defaultScanner
  ): Promise<DiscoveryProbeResult> {
    const cleanKeyword = keyword.trim().toLowerCase();
    const rawMatches: DiscoveredProject[] = [];

    for (const root of searchRoots) {
      const projects = await this.scanDirectory(root, cleanKeyword, 0, 3, scanner);
      rawMatches.push(...projects);
    }

    // Deduplicate by path
    const seen = new Set<string>();
    const uniqueMatches: DiscoveredProject[] = [];
    for (const match of rawMatches) {
      if (!seen.has(match.path)) {
        seen.add(match.path);
        uniqueMatches.push(match);
      }
    }

    // Rank and assign clean sequential IDs (1, 2, 3...)
    uniqueMatches.sort((a, b) => b.confidence - a.confidence);
    uniqueMatches.forEach((m, idx) => {
      m.id = `${idx + 1}`;
    });

    const disambiguationRequired = uniqueMatches.length > 1;
    let disambiguationPrompt: string | undefined;

    if (disambiguationRequired) {
      disambiguationPrompt = this.buildDisambiguationPrompt(cleanKeyword, uniqueMatches);
    }

    return {
      keyword: cleanKeyword,
      matches: uniqueMatches,
      disambiguationRequired,
      disambiguationPrompt
    };
  }

  /**
   * Recursively scan directory hierarchy looking for project signatures matching keyword
   */
  private static async scanDirectory(
    dir: string,
    keyword: string,
    currentDepth: number,
    maxDepth: number,
    scanner: FileSystemScanner
  ): Promise<DiscoveredProject[]> {
    if (currentDepth > maxDepth) return [];

    const baseName = path.basename(dir).toLowerCase();
    // Skip heavy non-project directories
    if (['node_modules', '.git', 'build', 'dist', 'target', '.cache', 'tmp', 'log', 'logs'].includes(baseName)) {
      return [];
    }

    const discovered: DiscoveredProject[] = [];
    const entries = await scanner.readdir(dir);
    if (!entries || entries.length === 0) return [];

    // Analyze if current directory represents a project
    const projectInfo = await this.inspectProjectSignature(dir, entries, keyword, scanner);
    if (projectInfo) {
      discovered.push(projectInfo);
      // Once a project root is identified, don't descend deeply into internal subfolders unless looking for packages
      if (projectInfo.type !== 'generic') {
        return discovered;
      }
    }

    // Recurse into subdirectories
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const subPath = path.join(dir, entry);
      const stat = await scanner.stat(subPath);
      if (stat.isDirectory()) {
        const subProjects = await this.scanDirectory(subPath, keyword, currentDepth + 1, maxDepth, scanner);
        discovered.push(...subProjects);
      }
    }

    return discovered;
  }

  /**
   * Inspect file signatures in a directory to detect ROS 1/2, Node, Python, or Rust projects.
   */
  public static async inspectProjectSignature(
    dir: string,
    files: string[],
    keyword: string,
    scanner: FileSystemScanner = this.defaultScanner
  ): Promise<DiscoveredProject | null> {
    let projectDir = dir;
    let dirName = path.basename(dir);
    if (dirName.toLowerCase() === 'src' && path.dirname(dir) !== dir) {
      projectDir = path.dirname(dir);
      dirName = path.basename(projectDir);
    }
    const lowerDir = dirName.toLowerCase();
    const filesLower = files.map(f => f.toLowerCase());

    let type: ProjectType = 'generic';
    let confidence = 0;
    let setupScript: string | undefined;
    let launchTarget: string | undefined;
    let description: string | undefined;

    // 1. ROS 2 Detection (package.xml with ament, install/setup.bash, *.launch.py)
    const hasPackageXml = filesLower.includes('package.xml') || await scanner.exists(path.join(projectDir, 'package.xml'));
    const hasInstallSetup = filesLower.includes('install') || await scanner.exists(path.join(projectDir, 'install', 'setup.bash')) || await scanner.exists(path.join(dir, 'install', 'setup.bash'));
    const hasDevelSetup = filesLower.includes('devel') || await scanner.exists(path.join(projectDir, 'devel', 'setup.bash')) || await scanner.exists(path.join(dir, 'devel', 'setup.bash'));
    const launchFiles = files.filter(f => f.endsWith('.launch.py') || f.endsWith('.launch'));

    if (hasPackageXml) {
      const xmlPath = filesLower.includes('package.xml') ? path.join(dir, 'package.xml') : path.join(projectDir, 'package.xml');
      const xmlContent = await scanner.readFile(xmlPath);
      if (xmlContent.includes('ament_cmake') || xmlContent.includes('ament_python') || hasInstallSetup) {
        type = 'ros2';
        confidence = 90;
        setupScript = 'source install/setup.bash';
        description = 'ROS 2 Workspace Package';
      } else if (xmlContent.includes('catkin') || hasDevelSetup) {
        type = 'ros1';
        confidence = 85;
        setupScript = 'source devel/setup.bash';
        description = 'ROS 1 Workspace Package';
      }
    } else if (hasInstallSetup) {
      type = 'ros2';
      confidence = 80;
      setupScript = 'source install/setup.bash';
      description = 'ROS 2 Built Workspace Root';
    } else if (hasDevelSetup) {
      type = 'ros1';
      confidence = 80;
      setupScript = 'source devel/setup.bash';
      description = 'ROS 1 Built Workspace Root';
    }

    // Check for launch target inside directory
    if (launchFiles.length > 0) {
      // Find matching launch file
      const matchLaunch = launchFiles.find(l => l.toLowerCase().includes(keyword)) || launchFiles[0];
      launchTarget = type === 'ros2' ? `ros2 launch ${dirName} ${matchLaunch}` : `roslaunch ${dirName} ${matchLaunch}`;
      confidence += 10;
    }

    // 2. Node.js Fullstack / Web
    if (filesLower.includes('package.json')) {
      type = 'node';
      confidence = confidence || 60;
      description = 'Node.js / Web Project';
      const pkgContent = await scanner.readFile(path.join(dir, 'package.json'));
      try {
        const parsed = JSON.parse(pkgContent);
        if (parsed.scripts?.dev) launchTarget = 'npm run dev';
        else if (parsed.scripts?.start) launchTarget = 'npm start';
      } catch {}
    }

    // 3. Python / AI
    if (filesLower.includes('pyproject.toml') || filesLower.includes('requirements.txt') || filesLower.includes('environment.yml')) {
      type = 'python';
      confidence = confidence || 60;
      description = 'Python Environment';
      if (filesLower.includes('main.py')) launchTarget = 'python main.py';
      else if (filesLower.includes('app.py')) launchTarget = 'python app.py';
      setupScript = 'source .venv/bin/activate';
    }

    // 4. Rust
    if (filesLower.includes('cargo.toml')) {
      type = 'rust';
      confidence = confidence || 60;
      description = 'Rust Project';
      launchTarget = 'cargo run';
    }

    // 5. Docker
    if (filesLower.includes('docker-compose.yml')) {
      type = 'docker';
      confidence = confidence || 60;
      description = 'Docker Compose Stack';
      launchTarget = 'docker compose up';
    }

    // Keyword relevance scoring
    const keywordMatches =
      lowerDir.includes(keyword) ||
      launchFiles.some(l => l.toLowerCase().includes(keyword)) ||
      (description && description.toLowerCase().includes(keyword));

    if (keywordMatches) {
      confidence += 40;
    }

    // Only include candidate if it matches the keyword or if search was universal
    if (keywordMatches || !keyword || keyword === '*') {
      return {
        id: '1',
        name: dirName,
        path: projectDir,
        type,
        launchTarget: launchTarget || (type === 'ros2' ? `ros2 run ${dirName} ${keyword}` : `./run.sh`),
        setupScript,
        description: description || `${type.toUpperCase()} Project`,
        confidence
      };
    }

    return null;
  }

  /**
   * Formats a clean, user-friendly numbered disambiguation prompt.
   */
  public static buildDisambiguationPrompt(keyword: string, matches: DiscoveredProject[]): string {
    const list = matches.map(m => {
      const typeBadge = m.type === 'ros2' ? 'ROS 2' : m.type === 'ros1' ? 'ROS 1' : m.type.toUpperCase();
      const relativePath = m.path.replace(process.env.HOME || '', '~');
      return `  [${m.id}] ${relativePath} (${typeBadge})`;
    }).join('\n');

    return `:: Found ${matches.length} project workspaces matching "${keyword}":\n${list}\nWhich project would you like to run? [1-${matches.length}]:`;
  }

  /**
   * Resolves a user's disambiguation reply (e.g. "1", "2", "quad_sim", "drone") to a project.
   */
  public static resolveSelection(answer: string, matches: DiscoveredProject[]): DiscoveredProject | null {
    const clean = answer.trim().toLowerCase();

    // 1. Direct numeric index selection (e.g. "1", "2")
    const num = parseInt(clean, 10);
    if (!isNaN(num) && num >= 1 && num <= matches.length) {
      return matches[num - 1];
    }

    // 2. Substring matching against project name or path
    const matched = matches.find(m =>
      m.name.toLowerCase().includes(clean) ||
      m.path.toLowerCase().includes(clean)
    );

    return matched || null;
  }
}
