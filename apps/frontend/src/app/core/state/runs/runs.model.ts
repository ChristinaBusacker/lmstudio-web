// src/app/core/state/runs/runs.model.ts

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';

export interface RunStatusDto {
  id: string;
  chatId: string;

  queueKey: string;
  status: RunStatus;

  clientRequestId: string | null;

  settingsProfileId: string | null;
  settingsSnapshot: Record<string, any>;

  sourceMessageId: string | null;
  targetMessageId: string | null;
  headMessageIdAtStart: string | null;

  lockedBy: string | null;
  lockedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;

  error: string | null;
  stats: Record<string, any> | null;

  createdVariantId: string | null;

  createdAt: string;
  updatedAt: string;
}

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
