/**
 * StarterWorkflows.ts — Curated Starter Workflow Definitions for Windows (PowerShell)
 *
 * Provides production-ready, deterministic workflow blueprints saved in
 * schemaVersion: 1. These workflows execute without AI token consumption
 * via DeterministicReplayEngine and can be selected during onboarding
 * or reset via WorkflowManagerDrawer.
 */

import { SavedWorkflowDefinition, CURRENT_WORKFLOW_SCHEMA_VERSION } from '../models/WorkflowTypes';

export interface StarterWorkflowMetadata {
  id: string;
  title: string;
  description: string;
  category: 'vcs' | 'system' | 'network' | 'devops' | 'developer';
  recommended: boolean;
  definition: SavedWorkflowDefinition;
}

export const STARTER_WORKFLOWS: StarterWorkflowMetadata[] = [
  {
    id: 'git-quick-sync',
    title: 'Git Quick Sync',
    description: 'Inspect status, stage tracked changes, commit with workspace message, and push to upstream branch.',
    category: 'vcs',
    recommended: true,
    definition: {
      schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
      name: 'git-quick-sync',
      description: 'Inspect working copy, stage tracked modifications, commit with message, and push to upstream.',
      author: 'Cero',
      tags: ['git', 'sync', 'vcs', 'starter'],
      createdAt: 1780000000000,
      updatedAt: 1780000000000,
      steps: [
        {
          id: 'step-1',
          name: 'Inspect Status',
          command: 'git status -s'
        },
        {
          id: 'step-2',
          name: 'Stage Tracked Changes',
          command: 'git add -u',
          dependsOn: ['step-1']
        },
        {
          id: 'step-3',
          name: 'Commit Changes',
          command: 'git commit -m "chore: sync workspace changes"',
          dependsOn: ['step-2']
        },
        {
          id: 'step-4',
          name: 'Push Upstream',
          command: 'git push',
          dependsOn: ['step-3']
        }
      ],
      parameters: []
    }
  },
  {
    id: 'system-diagnostics',
    title: 'System Health Diagnostics',
    description: 'Inspect memory, CPU load, system drive usage, and automatic services that are stopped.',
    category: 'system',
    recommended: true,
    definition: {
      schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
      name: 'system-diagnostics',
      description: 'Audit memory, CPU load and uptime, system drive usage, and stopped automatic services.',
      author: 'Cero',
      tags: ['system', 'diagnostics', 'windows', 'starter'],
      createdAt: 1780000000000,
      updatedAt: 1780000000000,
      steps: [
        {
          id: 'step-1',
          name: 'Memory Utilization',
          command: "Get-CimInstance Win32_OperatingSystem | Select-Object @{n='TotalGB';e={[math]::Round($_.TotalVisibleMemorySize/1MB,1)}},@{n='FreeGB';e={[math]::Round($_.FreePhysicalMemory/1MB,1)}}"
        },
        {
          id: 'step-2',
          name: 'CPU Load & Uptime',
          command: "Get-CimInstance Win32_Processor | Select-Object Name,LoadPercentage; (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime | Select-Object Days,Hours,Minutes",
          dependsOn: ['step-1']
        },
        {
          id: 'step-3',
          name: 'System Drive Capacity',
          command: "Get-PSDrive -Name C | Select-Object @{n='UsedGB';e={[math]::Round($_.Used/1GB,1)}},@{n='FreeGB';e={[math]::Round($_.Free/1GB,1)}}",
          dependsOn: ['step-2']
        },
        {
          id: 'step-4',
          name: 'Audit Stopped Automatic Services',
          command: "Get-Service | Where-Object { $_.StartType -eq 'Automatic' -and $_.Status -ne 'Running' } | Select-Object Name,DisplayName,Status",
          dependsOn: ['step-3']
        }
      ],
      parameters: []
    }
  },
  {
    id: 'network-open-ports',
    title: 'Network & Port Inspector',
    description: 'Scan active listening TCP/UDP sockets, verify default gateway reachability, and check DNS resolution.',
    category: 'network',
    recommended: true,
    definition: {
      schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
      name: 'network-open-ports',
      description: 'Audit active listening sockets, test gateway latency, and verify DNS resolution.',
      author: 'Cero',
      tags: ['network', 'ports', 'security', 'starter'],
      createdAt: 1780000000000,
      updatedAt: 1780000000000,
      steps: [
        {
          id: 'step-1',
          name: 'Audit Listening Ports',
          command: 'Get-NetTCPConnection -State Listen | Sort-Object LocalPort | Select-Object LocalAddress,LocalPort,OwningProcess'
        },
        {
          id: 'step-2',
          name: 'Gateway Connectivity Ping',
          command: 'Test-Connection 1.1.1.1 -Count 3',
          dependsOn: ['step-1']
        },
        {
          id: 'step-3',
          name: 'Verify DNS Lookup',
          command: 'Resolve-DnsName github.com -Type A',
          dependsOn: ['step-2']
        }
      ],
      parameters: []
    }
  },
  {
    id: 'docker-prune-clean',
    title: 'Docker Hygiene & Cleanup',
    description: 'Inspect active containers, calculate image storage footprint, and safely prune dangling resources.',
    category: 'devops',
    recommended: false,
    definition: {
      schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
      name: 'docker-prune-clean',
      description: 'Audit container states, inspect disk usage, and prune dangling Docker images.',
      author: 'Cero',
      tags: ['docker', 'containers', 'devops', 'starter'],
      createdAt: 1780000000000,
      updatedAt: 1780000000000,
      steps: [
        {
          id: 'step-1',
          name: 'Container Inventory',
          command: "docker ps -a --format 'table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}'"
        },
        {
          id: 'step-2',
          name: 'Calculate Docker Disk Usage',
          command: 'docker system df',
          dependsOn: ['step-1']
        },
        {
          id: 'step-3',
          name: 'Prune Dangling Containers & Images',
          command: 'docker system prune -f',
          dependsOn: ['step-2']
        }
      ],
      parameters: []
    }
  },
  {
    id: 'workspace-rebuild',
    title: 'Workspace Clean & Rebuild',
    description: 'Clear transient build caches and compile artifacts, verify toolchain versions, and run project build.',
    category: 'developer',
    recommended: false,
    definition: {
      schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
      name: 'workspace-rebuild',
      description: 'Purge transient build artifacts and trigger clean project compilation.',
      author: 'Cero',
      tags: ['build', 'developer', 'cleanup', 'starter'],
      createdAt: 1780000000000,
      updatedAt: 1780000000000,
      steps: [
        {
          id: 'step-1',
          name: 'Clean Build Artifacts',
          command: "Remove-Item -Recurse -Force -ErrorAction SilentlyContinue -Path 'dist','build','target','.cache'"
        },
        {
          id: 'step-2',
          name: 'Inspect Toolchain Availability',
          command: "foreach ($t in 'node','cargo','python') { if (Get-Command $t -ErrorAction SilentlyContinue) { & $t --version } }",
          dependsOn: ['step-1']
        },
        {
          id: 'step-3',
          name: 'Execute Project Compilation',
          command: "if (Test-Path package.json) { npm run build } elseif (Test-Path Cargo.toml) { cargo build } else { 'No standard build target detected' }",
          dependsOn: ['step-2']
        }
      ],
      parameters: []
    }
  }
];

export function getStarterWorkflowById(id: string): StarterWorkflowMetadata | undefined {
  return STARTER_WORKFLOWS.find(w => w.id === id);
}

export function getRecommendedStarterWorkflowIds(): string[] {
  return STARTER_WORKFLOWS.filter(w => w.recommended).map(w => w.id);
}

export function getAllStarterWorkflowIds(): string[] {
  return STARTER_WORKFLOWS.map(w => w.id);
}
