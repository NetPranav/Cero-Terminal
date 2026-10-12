/**
 * LearningTypes.ts — Core Data Models for Cero Learning Engine
 *
 * Defines ExperienceRecords, LearningProfiles, and Recommendations.
 */

export type ExperienceCategory =
  | 'workflow_executed'
  | 'repair_performed'
  | 'verification_failed'
  | 'application_opened'
  | 'repository_used'
  | 'project_started'
  | 'workflow_cancelled'
  | 'manual_override'
  | 'user_correction'
  | 'feedback_accepted'
  | 'feedback_rejected'
  | 'feedback_ignored'
  | 'feedback_edited';

export interface ExperienceContext {
  readonly sessionId: string;
  readonly workflowId?: string;
  readonly projectId?: string;
  readonly deviceId?: string;
}

export interface ExperienceRecord {
  readonly id: string;
  readonly category: ExperienceCategory;
  readonly entityId: string; // The ID of the thing being experienced (e.g. app ID, workflow ID, repair strategy)
  readonly timestamp: number;
  readonly durationMs?: number;
  readonly context: ExperienceContext;
  readonly metadata?: Record<string, unknown>;
}

export type LearningProfileType = 'personal' | 'work' | 'gaming' | 'development';

export interface LearningProfile {
  readonly id: string;
  readonly name: string;
  readonly type: LearningProfileType;
  readonly isActive: boolean;
  readonly createdAt: number;
}

export interface Recommendation {
  readonly id: string;
  readonly title: string;
  readonly actionId: string;
  readonly entityId: string;
  readonly confidence: number;
  readonly frequency: number;
  readonly recency: number;
  readonly supportingExperienceIds: string[];
  readonly explanation: string;
}

export interface RankingScore {
  readonly entityId: string;
  readonly score: number;
  readonly successRate: number;
  readonly frequency: number;
  readonly recencyWeight: number;
  readonly userPreferenceWeight: number;
}
