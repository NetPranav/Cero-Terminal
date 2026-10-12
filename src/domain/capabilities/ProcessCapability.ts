import { Capability, CapabilityResult } from '../Capability';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

export const processInputSchema = z.object({
  operation: z.enum(['list', 'kill', 'start']),
  pid: z.number().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional()
});

export type ProcessInput = z.infer<typeof processInputSchema>;

export class ProcessCapability implements Capability<ProcessInput, any> {
  metadata = {
    id: 'process.core',
    name: 'Process Management',
    description: 'List, start, or kill system processes.',
    category: 'Process' as const,
    supportedPlatforms: ['windows'] as 'windows'[],
    requiredPermissions: ['ProcessManagement'],
    version: '1.0.0'
  };

  inputSchema = processInputSchema;
  supportsDryRun = true;

  async execute(input: ProcessInput, isDryRun?: boolean): Promise<CapabilityResult<any>> {
    try {
      if (isDryRun) {
        return { success: true, data: { dryRun: true, operation: input.operation } };
      }

      switch (input.operation) {
        case 'list': {
          const processes = await invoke('list_processes');
          return { success: true, data: { processes } };
        }
        case 'kill': {
          if (input.pid === undefined) return { success: false, error: { code: 'MISSING_PID', message: "PID is required to kill a process" } };
          const killed = await invoke('kill_process', { pid: input.pid });
          return { success: killed as boolean };
        }
        case 'start': {
          if (!input.command) return { success: false, error: { code: 'MISSING_COMMAND', message: "Command is required to start a process" } };
          const output = await invoke<{ stdout: string; stderr: string; code: number }>('execute_command', {
            command: input.command,
            args: input.args || []
          });
          return { success: output.code === 0, data: { stdout: output.stdout, stderr: output.stderr, code: output.code } };
        }
        default:
          return { success: false, error: { code: 'UNSUPPORTED_OP', message: 'Unsupported operation' } };
      }
    } catch (e: any) {
      return { success: false, error: { code: 'PROCESS_ERROR', message: typeof e === 'string' ? e : (e.message || 'Process operation failed') } };
    }
  }
}
