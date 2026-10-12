import { Capability, CapabilityResult } from '../Capability';
import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';

export const shellInputSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional()
});

export type ShellInput = z.infer<typeof shellInputSchema>;

export class ShellCapability implements Capability<ShellInput, any> {
  metadata = {
    id: 'shell.core',
    name: 'Shell Execution',
    description: 'Execute arbitrary shell commands and capture output.',
    category: 'Shell' as const,
    supportedPlatforms: ['windows'] as 'windows'[],
    requiredPermissions: ['ShellExecution'],
    version: '1.0.0'
  };

  inputSchema = shellInputSchema;
  supportsDryRun = true;

  async execute(input: ShellInput, isDryRun?: boolean): Promise<CapabilityResult<any>> {
    try {
      if (isDryRun) {
        return { success: true, data: { dryRun: true, command: input.command, args: input.args } };
      }

      const output = await invoke<{ stdout: string; stderr: string; code: number }>('execute_command', {
        command: input.command,
        args: input.args || []
      });
      
      return { 
        success: output.code === 0, 
        data: { 
          stdout: output.stdout, 
          stderr: output.stderr, 
          code: output.code 
        },
        error: output.code !== 0 ? { code: 'NON_ZERO_EXIT', message: `Process exited with code ${output.code}: ${output.stderr || output.stdout}` } : undefined
      };
    } catch (e: any) {
      return { success: false, error: { code: 'SHELL_ERROR', message: typeof e === 'string' ? e : (e.message || 'Shell execution failed') } };
    }
  }
}
