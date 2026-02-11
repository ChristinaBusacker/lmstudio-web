// src/app/core/state/runs/runs.model.ts

import type { RunState as SharedRunState, RunStatus as SharedRunStatus } from '@shared/contracts';

/**
 * Legacy exports kept for backward compatibility within the frontend codebase.
 * The source of truth lives in @shared/contracts.
 */
export type RunStatus = SharedRunState;
export type RunStatusDto = SharedRunStatus;

export interface RunsStateModel {
  /** keyed by runId */
  entities: Record<string, RunStatusDto>;
  /** newest first */
  order: string[];
  /** For quick UI: active = queued + running */
  activeIds: string[];

  loadedActive: boolean;
  loadingActive: boolean;
  error: string | null;
}
