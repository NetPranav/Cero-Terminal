import { z } from 'zod';
import { Tool, ToolMetadata, ToolResult, ToolCategory, ToolRisk } from './tool/types';
import { ToolRegistry } from './tool/ToolRegistry';

export type CapabilityCategory = 'Filesystem' | 'Process' | 'Shell' | 'System' | 'Clipboard' | 'Network' | 'Git' | 'Other';

export interface CapabilityMetadata {
  id: string;
  name: string;
  description: string;
  category: CapabilityCategory;
  supportedPlatforms: 'windows'[];
  requiredPermissions: string[];
  version: string;
}

export function mapCapabilityToToolMetadata(cap: CapabilityMetadata): ToolMetadata {
  return {
    id: cap.id,
    version: cap.version,
    displayName: cap.name,
    description: cap.description,
    category: cap.category as ToolCategory,
    risk: 'MEDIUM' as ToolRisk, 
    permissions: cap.requiredPermissions,
    examples: [],
    tags: [cap.category.toLowerCase()],
    supportedPlatforms: cap.supportedPlatforms,
    deprecationStatus: 'stable'
  };
}

export interface RollbackAction {
  executeRollback: () => Promise<boolean>;
  description: string;
}

export interface CapabilityResult<T = any> {
  success: boolean;
  data?: T;
  error?: any;
  executionTimeMs?: number;
  rollbackAction?: RollbackAction;
}

export interface Capability<InputType = any, OutputType = any> {
  metadata: CapabilityMetadata;
  toolMetadata?: ToolMetadata; 
  
  inputSchema: z.ZodSchema<InputType>; 
  outputSchema?: z.ZodSchema<OutputType>;

  supportsDryRun: boolean;

  execute(input: InputType, isDryRun?: boolean): Promise<CapabilityResult<OutputType>>;
  
  verify?(input: InputType, result: CapabilityResult<OutputType>): Promise<boolean>;
}

export class CapabilityRegistry {
  private static instance: CapabilityRegistry;
  private capabilities: Map<string, Capability> = new Map();

  private constructor() {}

  public static getInstance(): CapabilityRegistry {
    if (!CapabilityRegistry.instance) {
      CapabilityRegistry.instance = new CapabilityRegistry();
    }
    return CapabilityRegistry.instance;
  }

  public register(capability: Capability): void {
    if (this.capabilities.has(capability.metadata.id)) {
      console.warn(`Capability ${capability.metadata.id} is already registered. Overwriting.`);
    }
    
    // Auto-map and register to new ToolRegistry
    capability.toolMetadata = mapCapabilityToToolMetadata(capability.metadata);
    ToolRegistry.getInstance().register({
       metadata: capability.toolMetadata,
       execute: capability.execute.bind(capability)
    });
    
    this.capabilities.set(capability.metadata.id, capability);
  }

  public unregister(id: string): void {
    this.capabilities.delete(id);
  }

  public get(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  public list(): CapabilityMetadata[] {
    return Array.from(this.capabilities.values()).map(c => c.metadata);
  }
}

// Note: CapabilityManager logic will be shifted heavily to ExecutionEngine in Phase 4.
// The CapabilityManager will simply load/unload capabilities and pass executions to ExecutionEngine.
export class CapabilityManager {
  private static instance: CapabilityManager;
  private registry = CapabilityRegistry.getInstance();

  private constructor() {}

  public static getInstance(): CapabilityManager {
    if (!CapabilityManager.instance) {
      CapabilityManager.instance = new CapabilityManager();
    }
    return CapabilityManager.instance;
  }

  public getRegistry(): CapabilityRegistry {
      return this.registry;
  }

  public register(capability: Capability): void {
      this.registry.register(capability);
  }

  public unregister(id: string): void {
      this.registry.unregister(id);
  }

  public get(id: string): Capability | undefined {
      return this.registry.get(id);
  }

  public list(): CapabilityMetadata[] {
      return this.registry.list();
  }

  public async execute<I = any, O = any>(capabilityId: string, input: I, isDryRun: boolean = false): Promise<any> {
    const startTime = performance.now();
    const cap = this.registry.get(capabilityId);
    if (!cap) {
      return {
        success: false,
        error: `Capability '${capabilityId}' not found.`,
        executionTimeMs: performance.now() - startTime
      };
    }
    try {
      const res = await cap.execute(input, isDryRun);
      if (res.executionTimeMs === undefined) {
        res.executionTimeMs = performance.now() - startTime;
      }
      return res;
    } catch (err: any) {
      const errorMsg = typeof err === 'string' ? err : (err.message || 'Unknown execution error');
      return {
        success: false,
        error: errorMsg,
        executionTimeMs: performance.now() - startTime
      };
    }
  }
}
