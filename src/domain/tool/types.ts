export type ToolCategory = 'Filesystem' | 'Process' | 'Shell' | 'System' | 'Clipboard' | 'Network' | 'Git' | 'Browser' | 'Other';
export type ToolRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Platform = 'windows';

export interface ToolMetadata {
  id: string;
  version: string;
  displayName: string;
  description: string;
  category: ToolCategory;
  risk: ToolRisk;
  permissions: string[];
  
  // JSON Schema definitions for LLM context
  parametersSchema?: any; 
  returnsSchema?: any;
  
  examples: string[];
  tags: string[];
  
  supportedPlatforms: Platform[];
  deprecationStatus?: 'stable' | 'deprecated' | 'experimental';
}

export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  executionTimeMs?: number;
}

export interface Tool<InputType = any, OutputType = any> {
  metadata: ToolMetadata;
  execute(input: InputType, isDryRun?: boolean): Promise<ToolResult<OutputType>>;
}
