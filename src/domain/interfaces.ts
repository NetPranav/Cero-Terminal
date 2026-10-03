// Domain Layer Interfaces for Cero

export type IntentType = 
  | 'ShellCommand'
  | 'NaturalLanguage'
  | 'Mixed'
  | 'Question'
  | 'Search'
  | 'Workflow'
  | 'Code'
  | 'Git'
  | 'Filesystem'
  | 'Network'
  | 'System'
  | 'Planning';

export interface InputRouter {
  classify(input: string): Promise<IntentType>;
  route(input: string, intent: IntentType): Promise<void>;
}

export type RiskLevel = 'SAFE' | 'SENSITIVE' | 'ADMIN' | 'CRITICAL';

export interface SecurityEngine {
  assessRisk(action: string, capabilityName?: string): Promise<RiskLevel>;
  validateOverride(action: string, userConfirmation: string): boolean;
}

export type PermissionCategory = 
  | 'ReadFiles' 
  | 'WriteFiles' 
  | 'DeleteFiles' 
  | 'RenameFiles' 
  | 'Network' 
  | 'Clipboard' 
  | 'Git' 
  | 'Docker' 
  | 'SSH' 
  | 'SystemSettings' 
  | 'Administrator';

export type PermissionRule = 'AlwaysAllow' | 'AskEveryTime' | 'AlwaysDeny';

export interface PermissionManager {
  checkPermission(category: PermissionCategory): Promise<boolean>;
  requestPermission(category: PermissionCategory, reason: string): Promise<boolean>;
  getRule(category: PermissionCategory): PermissionRule;
  setRule(category: PermissionCategory, rule: PermissionRule): void;
}

export interface Capability {
  name: string;
  description: string;
  supportedPlatforms: string[];
  requiredPermissions: PermissionCategory[];
  execute(params: Record<string, any>): Promise<any>;
}

export interface CapabilityRegistry {
  register(capability: Capability): void;
  get(name: string): Capability | undefined;
  list(): Capability[];
}

export interface ExecutionNode {
  id: string;
  capabilityName?: string;
  command?: string;
  params: Record<string, any>;
  dependencies: string[]; // IDs of nodes that must complete before this one
  status: 'Pending' | 'Running' | 'Completed' | 'Failed';
  result?: any;
}

export interface ExecutionGraph {
  nodes: ExecutionNode[];
  addNode(node: ExecutionNode): void;
  execute(): Promise<void>;
  rollback(): Promise<void>;
}

export interface Planner {
  observe(context: any): void;
  reason(goal: string): Promise<void>;
  plan(goal: string): Promise<ExecutionGraph>;
  verify(graph: ExecutionGraph): Promise<boolean>;
  report(): void;
}
