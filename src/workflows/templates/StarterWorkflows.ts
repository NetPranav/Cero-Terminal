/**
 * StarterWorkflows.ts — Curated Starter Workflow Definitions for Linux
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
    description: 'Inspect available RAM/swap, CPU load averages, root disk utilization, and failed systemd units.',
    category: 'system',
    recommended: true,
    definition: {
      schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
      name: 'system-diagnostics',
      description: 'Audit RAM, swap, CPU load averages, root disk usage, and identify failed systemd services.',
      author: 'Cero',
      tags: ['system', 'diagnostics', 'linux', 'starter'],
      createdAt: 1780000000000,
      updatedAt: 1780000000000,
      steps: [
        {
          id: 'step-1',
          name: 'Memory & Swap Utilization',
          command: 'free -h'
        },
        {
          id: 'step-2',
          name: 'CPU Load & Uptime',
          command: 'uptime',
          dependsOn: ['step-1']
        },
        {
          id: 'step-3',
          name: 'Root Storage Capacity',
          command: 'df -h /',
          dependsOn: ['step-2']
        },
        {
          id: 'step-4',
          name: 'Audit Failed Services',
          command: 'systemctl --failed --no-pager 2>/dev/null || echo "systemd not available in current environment"',
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
          command: 'ss -tulpn 2>/dev/null || netstat -tulpn 2>/dev/null || lsof -i -P -n 2>/dev/null'
        },
        {
          id: 'step-2',
          name: 'Gateway Connectivity Ping',
          command: 'ping -c 3 1.1.1.1 2>/dev/null || echo "ICMP ping not permitted or offline"',
          dependsOn: ['step-1']
        },
        {
          id: 'step-3',
          name: 'Verify DNS Lookup',
          command: 'getent hosts github.com 2>/dev/null || nslookup github.com 2>/dev/null || host github.com 2>/dev/null',
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
          command: 'docker ps -a --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}" 2>/dev/null || echo "Docker daemon not running"'
        },
        {
          id: 'step-2',
          name: 'Calculate Docker Disk Usage',
          command: 'docker system df 2>/dev/null || true',
          dependsOn: ['step-1']
        },
        {
          id: 'step-3',
          name: 'Prune Dangling Containers & Images',
          command: 'docker system prune -f 2>/dev/null || true',
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
          command: 'rm -rf dist build target .cache 2>/dev/null || true'
        },
        {
          id: 'step-2',
          name: 'Inspect Toolchain Availability',
          command: 'node -v 2>/dev/null || cargo --version 2>/dev/null || python3 --version 2>/dev/null || echo "Development toolchain ready"',
          dependsOn: ['step-1']
        },
        {
          id: 'step-3',
          name: 'Execute Project Compilation',
          command: 'npm run build 2>/dev/null || cargo build 2>/dev/null || make 2>/dev/null || echo "No standard build target detected"',
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
