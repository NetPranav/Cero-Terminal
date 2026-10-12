import { Capability, CapabilityResult } from '../Capability';
import { readTextFile, writeTextFile, readDir, remove, rename, mkdir, DirEntry, exists } from '@tauri-apps/plugin-fs';
import { z } from 'zod';

export const fsInputSchema = z.object({
  operation: z.enum(['read', 'write', 'list', 'delete', 'rename', 'mkdir']),
  path: z.string().min(1),
  newPath: z.string().optional(),
  content: z.string().optional(),
  recursive: z.boolean().optional()
});

export type FsInput = z.infer<typeof fsInputSchema>;

export class FilesystemCapability implements Capability<FsInput, any> {
  metadata = {
    id: 'fs.core',
    name: 'Filesystem Operations',
    description: 'Read, write, list, delete, rename, and create directories.',
    category: 'Filesystem' as const,
    supportedPlatforms: ['windows'] as 'windows'[],
    requiredPermissions: ['ReadFiles', 'WriteFiles', 'DeleteFiles', 'RenameFiles'],
    version: '1.0.0'
  };

  inputSchema = fsInputSchema;
  supportsDryRun = true;

  async execute(input: FsInput, isDryRun?: boolean): Promise<CapabilityResult<any>> {
    try {
      if (isDryRun) {
        return { success: true, data: { dryRun: true, operation: input.operation, path: input.path } };
      }

      switch (input.operation) {
        case 'read': {
          const content = await readTextFile(input.path);
          return { success: true, data: { content } };
        }
        case 'write': {
          if (input.content === undefined) return { success: false, error: { code: 'MISSING_CONTENT', message: "Content is required for write operation" } };
          await writeTextFile(input.path, input.content);
          return { success: true };
        }
        case 'list': {
          const entries: DirEntry[] = await readDir(input.path);
          return { success: true, data: { entries } };
        }
        case 'delete': {
          // Implementing basic Safe Delete constraint natively requires moving to a trash bin,
          // for simplicity in this demo we do a hard remove but PolicyEngine can deny system paths.
          await remove(input.path, { recursive: input.recursive });
          return { success: true };
        }
        case 'rename': {
          if (!input.newPath) return { success: false, error: { code: 'MISSING_NEWPATH', message: "newPath is required for rename operation" } };
          await rename(input.path, input.newPath);
          return { success: true, rollbackAction: { description: `Rename back to ${input.path}`, executeRollback: async () => { await rename(input.newPath!, input.path); return true; }} };
        }
        case 'mkdir': {
          await mkdir(input.path, { recursive: input.recursive });
          return { success: true, rollbackAction: { description: `Remove directory ${input.path}`, executeRollback: async () => { await remove(input.path); return true; }} };
        }
        default:
          return { success: false, error: { code: 'UNSUPPORTED_OP', message: 'Unsupported operation' } };
      }
    } catch (e: any) {
      return { success: false, error: { code: 'FS_ERROR', message: e.message || 'Filesystem operation failed' } };
    }
  }

  async verify(input: FsInput, result: CapabilityResult<any>): Promise<boolean> {
    if (!result.success) return true; // Nothing to verify if it failed

    try {
      if (input.operation === 'write' || input.operation === 'mkdir') {
         return await exists(input.path);
      }
      if (input.operation === 'delete') {
         return !(await exists(input.path));
      }
      if (input.operation === 'rename' && input.newPath) {
         return await exists(input.newPath) && !(await exists(input.path));
      }
      return true;
    } catch {
      return false;
    }
  }
}
