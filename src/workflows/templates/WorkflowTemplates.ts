/**
 * WorkflowTemplates.ts — 6 Built-in Immutable Workflow Templates
 *
 * Templates are immutable blueprints. Users clone them into UserWorkflows for editing.
 * Each template is fully parameterized with strongly typed variables and declared outputs.
 */

import { WorkflowTemplate } from '../models/WorkflowTypes';

function makeTemplate(
  id: string,
  name: string,
  description: string,
  category: string,
  tags: string[],
  template: Partial<WorkflowTemplate>
): WorkflowTemplate {
  return {
    id,
    metadata: {
      author: 'Cero',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: '1.0.0',
      tags,
      description,
      category,
    },
    variables: template.variables || [],
    nodes: template.nodes || [],
    outputs: template.outputs || [],
    triggers: template.triggers || [],
    immutable: true,
    source: 'builtin',
  };
}

export const morningDevelopmentTemplate: WorkflowTemplate = makeTemplate(
  'tpl-morning-development',
  'Morning Development',
  'Launch IDE, terminal, browser, and connect WiFi for a productive morning development session.',
  'productivity',
  ['morning', 'development', 'setup', 'productivity'],
  {
    variables: [
      { name: 'ide', type: 'application', description: 'IDE application to launch', required: false, defaultValue: 'Cursor' },
      { name: 'browser', type: 'application', description: 'Browser to open', required: false, defaultValue: 'Safari' },
      { name: 'wifiSSID', type: 'string', description: 'WiFi network to connect', required: false, defaultValue: 'Home_5G' },
    ],
    nodes: [
      { id: 'connect-wifi', type: 'action', name: 'Connect WiFi', actionId: 'network.wifi.connect', parameters: { ssid: '{{wifiSSID}}' }, dependencies: [] },
      { id: 'launch-ide', type: 'action', name: 'Launch IDE', actionId: 'application.launch', parameters: { application: '{{ide}}' }, dependencies: ['connect-wifi'] },
      { id: 'launch-terminal', type: 'action', name: 'Launch Terminal', actionId: 'application.launch', parameters: { application: 'Terminal' }, dependencies: ['connect-wifi'] },
      { id: 'launch-browser', type: 'action', name: 'Launch Browser', actionId: 'application.launch', parameters: { application: '{{browser}}' }, dependencies: ['connect-wifi'] },
    ],
    outputs: [
      { name: 'connectedSSID', type: 'string', description: 'Connected WiFi network', sourceNodeId: 'connect-wifi', sourceKey: 'connectedSSID' },
    ],
    triggers: [{ type: 'on_login', enabled: true }],
  }
);

export const projectBootstrapTemplate: WorkflowTemplate = makeTemplate(
  'tpl-project-bootstrap',
  'Project Bootstrap',
  'Create project directory, initialize git, install dependencies, and open editor.',
  'development',
  ['project', 'bootstrap', 'git', 'init'],
  {
    variables: [
      { name: 'projectPath', type: 'path', description: 'Project directory path', required: true },
      { name: 'projectName', type: 'string', description: 'Project name', required: true },
      { name: 'ide', type: 'application', description: 'Editor to open', required: false, defaultValue: 'Cursor' },
    ],
    nodes: [
      { id: 'create-dir', type: 'action', name: 'Create Project Directory', actionId: 'filesystem.create_directory', parameters: { path: '{{projectPath}}/{{projectName}}' }, dependencies: [] },
      { id: 'git-init', type: 'action', name: 'Initialize Git', actionId: 'git.init', parameters: { path: '{{projectPath}}/{{projectName}}' }, dependencies: ['create-dir'] },
      { id: 'open-editor', type: 'action', name: 'Open Editor', actionId: 'application.open', parameters: { application: '{{ide}}', path: '{{projectPath}}/{{projectName}}' }, dependencies: ['git-init'] },
    ],
    outputs: [
      { name: 'workspacePath', type: 'path', description: 'Created workspace path', sourceNodeId: 'create-dir', sourceKey: 'createdPath' },
    ],
    triggers: [{ type: 'manual', enabled: true }],
  }
);

export const gitReleaseTemplate: WorkflowTemplate = makeTemplate(
  'tpl-git-release',
  'Git Release',
  'Checkout release branch, run tests, bump version, tag, and push.',
  'development',
  ['git', 'release', 'deploy', 'versioning'],
  {
    variables: [
      { name: 'repoPath', type: 'repository', description: 'Repository path', required: true },
      { name: 'branch', type: 'string', description: 'Release branch name', required: false, defaultValue: 'main' },
      { name: 'version', type: 'string', description: 'Release version tag', required: true },
    ],
    nodes: [
      { id: 'checkout', type: 'action', name: 'Checkout Branch', actionId: 'git.checkout', parameters: { path: '{{repoPath}}', branch: '{{branch}}' }, dependencies: [] },
      { id: 'run-tests', type: 'action', name: 'Run Tests', actionId: 'developer.run_tests', parameters: { path: '{{repoPath}}' }, dependencies: ['checkout'] },
      { id: 'tag-release', type: 'action', name: 'Tag Release', actionId: 'git.tag', parameters: { path: '{{repoPath}}', tag: 'v{{version}}' }, dependencies: ['run-tests'] },
      { id: 'push', type: 'action', name: 'Push to Remote', actionId: 'git.push', parameters: { path: '{{repoPath}}', tags: true }, dependencies: ['tag-release'] },
    ],
    outputs: [
      { name: 'tagName', type: 'string', description: 'Created tag name', sourceNodeId: 'tag-release', sourceKey: 'tag' },
    ],
    triggers: [{ type: 'manual', enabled: true }],
  }
);

export const dockerStackTemplate: WorkflowTemplate = makeTemplate(
  'tpl-docker-stack',
  'Docker Stack',
  'Build Docker images, start compose stack, verify health, and tail logs.',
  'devops',
  ['docker', 'compose', 'container', 'devops'],
  {
    variables: [
      { name: 'composePath', type: 'path', description: 'Docker compose file path', required: true },
      { name: 'serviceName', type: 'string', description: 'Primary service to monitor', required: false, defaultValue: 'app' },
    ],
    nodes: [
      { id: 'build', type: 'action', name: 'Build Images', actionId: 'docker.build', parameters: { composePath: '{{composePath}}' }, dependencies: [] },
      { id: 'start', type: 'action', name: 'Start Stack', actionId: 'docker.compose_up', parameters: { composePath: '{{composePath}}' }, dependencies: ['build'] },
      { id: 'health', type: 'action', name: 'Verify Health', actionId: 'docker.health_check', parameters: { service: '{{serviceName}}' }, dependencies: ['start'] },
    ],
    outputs: [
      { name: 'containerIds', type: 'array', description: 'Started container IDs', sourceNodeId: 'start', sourceKey: 'containerIds' },
    ],
    triggers: [{ type: 'manual', enabled: true }],
  }
);

export const pythonEnvironmentTemplate: WorkflowTemplate = makeTemplate(
  'tpl-python-environment',
  'Python Environment',
  'Create virtual environment, install requirements, and verify interpreter.',
  'development',
  ['python', 'venv', 'pip', 'environment'],
  {
    variables: [
      { name: 'projectPath', type: 'path', description: 'Project directory path', required: true },
      { name: 'pythonVersion', type: 'string', description: 'Python version', required: false, defaultValue: '3.12' },
    ],
    nodes: [
      { id: 'create-venv', type: 'action', name: 'Create Virtual Environment', actionId: 'python.venv_create', parameters: { path: '{{projectPath}}', version: '{{pythonVersion}}' }, dependencies: [] },
      { id: 'install-deps', type: 'action', name: 'Install Requirements', actionId: 'python.pip_install', parameters: { path: '{{projectPath}}', requirements: '{{projectPath}}/requirements.txt' }, dependencies: ['create-venv'] },
      { id: 'verify', type: 'action', name: 'Verify Interpreter', actionId: 'python.verify', parameters: { path: '{{projectPath}}' }, dependencies: ['install-deps'] },
    ],
    outputs: [
      { name: 'venvPath', type: 'path', description: 'Virtual environment path', sourceNodeId: 'create-venv', sourceKey: 'venvPath' },
    ],
    triggers: [{ type: 'manual', enabled: true }],
  }
);

export const nodeProjectTemplate: WorkflowTemplate = makeTemplate(
  'tpl-node-project',
  'Node Project',
  'Initialize Node.js project, install packages, create entry file, and run dev server.',
  'development',
  ['node', 'npm', 'javascript', 'typescript'],
  {
    variables: [
      { name: 'projectPath', type: 'path', description: 'Project directory path', required: true },
      { name: 'projectName', type: 'string', description: 'Package name', required: true },
      { name: 'devPort', type: 'port', description: 'Development server port', required: false, defaultValue: 3000 },
    ],
    nodes: [
      { id: 'npm-init', type: 'action', name: 'Initialize Package', actionId: 'node.npm_init', parameters: { path: '{{projectPath}}', name: '{{projectName}}' }, dependencies: [] },
      { id: 'install', type: 'action', name: 'Install Dependencies', actionId: 'node.npm_install', parameters: { path: '{{projectPath}}' }, dependencies: ['npm-init'] },
      { id: 'dev-server', type: 'action', name: 'Start Dev Server', actionId: 'node.run_dev', parameters: { path: '{{projectPath}}', port: '{{devPort}}' }, dependencies: ['install'] },
    ],
    outputs: [
      { name: 'projectPID', type: 'number', description: 'Dev server process ID', sourceNodeId: 'dev-server', sourceKey: 'pid' },
      { name: 'devUrl', type: 'string', description: 'Dev server URL', sourceNodeId: 'dev-server', sourceKey: 'url' },
    ],
    triggers: [{ type: 'manual', enabled: true }],
  }
);

/** All built-in immutable workflow templates */
export const builtinTemplates: WorkflowTemplate[] = [
  morningDevelopmentTemplate,
  projectBootstrapTemplate,
  gitReleaseTemplate,
  dockerStackTemplate,
  pythonEnvironmentTemplate,
  nodeProjectTemplate,
];

export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return builtinTemplates.find(t => t.id === id);
}
