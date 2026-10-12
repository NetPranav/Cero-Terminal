import { Capability, CapabilityResult } from '../Capability';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { z } from 'zod';

export const clipboardInputSchema = z.object({
  operation: z.enum(['read', 'write']),
  content: z.string().optional()
});

export type ClipboardInput = z.infer<typeof clipboardInputSchema>;

export class ClipboardCapability implements Capability<ClipboardInput, any> {
  metadata = {
    id: 'clipboard.core',
    name: 'Clipboard Management',
    description: 'Read from and write to the system clipboard.',
    category: 'Clipboard' as const,
    supportedPlatforms: ['windows'] as 'windows'[],
    requiredPermissions: ['Clipboard'],
    version: '1.0.0'
  };

  inputSchema = clipboardInputSchema;
  supportsDryRun = true;

  async execute(input: ClipboardInput, isDryRun?: boolean): Promise<CapabilityResult<any>> {
    try {
      if (isDryRun) {
        return { success: true, data: { dryRun: true, operation: input.operation } };
      }

      if (input.operation === 'read') {
        const content = await readText();
        return { success: true, data: { content } };
      } else if (input.operation === 'write') {
        if (input.content === undefined) return { success: false, error: { code: 'MISSING_CONTENT', message: "Content is required for write operation" } };
        
        // Before writing, we could theoretically read the old clipboard to enable rollback,
        // but clipboard is transient anyway.
        await writeText(input.content);
        return { success: true };
      }
      return { success: false, error: { code: 'UNSUPPORTED_OP', message: 'Unsupported operation' } };
    } catch (e: any) {
      return { success: false, error: { code: 'CLIPBOARD_ERROR', message: e.message || 'Clipboard operation failed' } };
    }
  }
}
