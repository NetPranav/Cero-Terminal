import { Capability, CapabilityResult } from '../Capability';
import { arch, hostname, platform, version, type } from '@tauri-apps/plugin-os';
import { z } from 'zod';

export const systemInputSchema = z.void();

export interface SystemInfoOutput {
  architecture: string;
  hostname: string;
  platform: string;
  version: string;
  type: string;
}

export class SystemCapability implements Capability<void, SystemInfoOutput> {
  metadata = {
    id: 'system.info',
    name: 'System Information',
    description: 'Retrieves information about the operating system and hardware.',
    category: 'System' as const,
    supportedPlatforms: ['windows'] as 'windows'[],
    requiredPermissions: [],
    version: '1.0.0'
  };

  inputSchema = systemInputSchema;
  supportsDryRun = true;

  async execute(_input: void, isDryRun?: boolean): Promise<CapabilityResult<SystemInfoOutput>> {
    try {
      if (isDryRun) {
        return { success: true, data: { architecture: 'dry-run', hostname: 'dry-run', platform: 'dry-run', version: 'dry-run', type: 'dry-run' } };
      }

      const archStr = await arch();
      const hostnameStr = await hostname();
      const platformStr = await platform();
      const versionStr = await version();
      const typeStr = await type();

      return {
        success: true,
        data: {
          architecture: archStr,
          hostname: hostnameStr || 'unknown',
          platform: platformStr,
          version: versionStr,
          type: typeStr
        }
      };
    } catch (e: any) {
      return {
        success: false,
        error: { code: 'SYS_ERROR', message: e.message || 'Failed to retrieve system info' }
      };
    }
  }
}
