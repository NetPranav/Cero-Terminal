/**
 * ReleaseMetadata.ts — Build hashes and schemas
 */

export interface CeroRelease {
  readonly version: string;
  readonly buildHash: string;
  readonly gitCommit: string;
  readonly sdkVersion: string;
  readonly pluginApiVersion: string;
  readonly schemas: {
    readonly workflow: string;
    readonly memory: string;
    readonly config: string;
  };
}

export class ReleaseMetadata {
  public static getInfo(): CeroRelease {
    // In production, these values are injected via Webpack/Vite build envs
    return {
      version: '3.0.0',
      buildHash: 'a1b2c3d4',
      gitCommit: '439a2b8e',
      sdkVersion: '1.2.0',
      pluginApiVersion: '2.0.0',
      schemas: {
        workflow: 'v1.4',
        memory: 'v2.1',
        config: 'v1.0'
      }
    };
  }
}
