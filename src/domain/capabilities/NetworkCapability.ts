import { Capability, CapabilityResult } from '../Capability';
import { fetch } from '@tauri-apps/plugin-http';
import { z } from 'zod';

export const networkInputSchema = z.object({
  operation: z.literal('fetch'),
  url: z.string().url(),
  method: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.any().optional()
});

export type NetworkInput = z.infer<typeof networkInputSchema>;

export class NetworkCapability implements Capability<NetworkInput, any> {
  metadata = {
    id: 'network.core',
    name: 'Network Requests',
    description: 'Perform HTTP network requests.',
    category: 'Network' as const,
    supportedPlatforms: ['windows'] as 'windows'[],
    requiredPermissions: ['Network'],
    version: '1.0.0'
  };

  inputSchema = networkInputSchema;
  supportsDryRun = true;

  async execute(input: NetworkInput, isDryRun?: boolean): Promise<CapabilityResult<any>> {
    try {
      if (isDryRun) {
        return { success: true, data: { dryRun: true, url: input.url, method: input.method || 'GET' } };
      }

      if (input.operation === 'fetch') {
        const response = await fetch(input.url, {
          method: input.method || 'GET',
          headers: input.headers as any,
          body: input.body ? JSON.stringify(input.body) : undefined
        });

        const text = await response.text();
        let data = text;
        try {
          data = JSON.parse(text);
        } catch {
          // If it's not JSON, return as text
        }

        return { 
          success: response.ok, 
          data: {
            status: response.status,
            statusText: response.statusText,
            data
          },
          error: !response.ok ? { code: 'HTTP_ERROR', message: `HTTP ${response.status}: ${response.statusText}` } : undefined
        };
      }
      return { success: false, error: { code: 'UNSUPPORTED_OP', message: 'Unsupported network operation' } };
    } catch (e: any) {
      return { success: false, error: { code: 'NETWORK_ERROR', message: e.message || 'Network operation failed' } };
    }
  }
}
