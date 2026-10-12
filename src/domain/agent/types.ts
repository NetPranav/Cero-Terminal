import { WorkflowStep, TaskStatus, RetryPolicy } from '../workflow/types';

export type AgentEvent = 
  | 'WorkflowStarted'
  | 'StepStarted'
  | 'StepCompleted'
  | 'VerificationStarted'
  | 'VerificationPassed'
  | 'VerificationFailed'
  | 'RetryStarted'
  | 'RetrySucceeded'
  | 'RetryFailed'
  | 'PlannerRepairRequested'
  | 'PlannerRepairStarted'
  | 'PlannerRepairCompleted'
  | 'ApprovalRequested'
  | 'ApprovalGranted'
  | 'ApprovalDenied'
  | 'WorkflowPaused'
  | 'WorkflowResumed'
  | 'WorkflowCancelled'
  | 'WorkflowCompleted'
  | 'WorkflowFailed';

export interface AgentExecutionState {
  workflowId: string;
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'CANCELLED' | 'COMPLETED' | 'FAILED';
  currentStepId?: string;
  completedSteps: string[];
  failedSteps: string[];
  retries: Record<string, number>; // stepId -> retry count
  startTime: number;
  endTime?: number;
  logs: string[];
}

export interface ExecutionSummary {
  goal: string;
  completedSteps: string[];
  skippedSteps: string[];
  failedSteps: string[];
  retries: Record<string, number>;
  repairCount: number;
  executionTimeMs: number;
  warnings: string[];
  finalResult: 'Success' | 'Failed' | 'Cancelled';
}
