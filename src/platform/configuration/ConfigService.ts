/**
 * ConfigService.ts — Unified Configuration Manager
 */

export type RuntimeProfile = 'Development' | 'Production' | 'Portable' | 'Recovery' | 'Safe Mode';

export interface CeroConfig {
  readonly profile: RuntimeProfile;
  readonly maxMemoryGb: number;
  readonly telemetryEnabled: boolean;
  readonly autoUpdate: boolean;
}

const DEFAULT_CONFIG: CeroConfig = {
  profile: 'Production',
  maxMemoryGb: 4,
  telemetryEnabled: true,
  autoUpdate: true
};

export class ConfigService {
  private config: CeroConfig;

  constructor(initialConfig: Partial<CeroConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...initialConfig };
  }

  public getProfile(): RuntimeProfile {
    return this.config.profile;
  }

  public getConfig(): Readonly<CeroConfig> {
    return Object.freeze({ ...this.config });
  }

  public update(newValues: Partial<CeroConfig>): void {
    this.config = { ...this.config, ...newValues };
  }
}

export const globalConfigService = new ConfigService();
