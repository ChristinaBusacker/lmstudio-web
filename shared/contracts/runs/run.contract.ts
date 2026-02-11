// shared/contracts/runs/run.contract.ts
import type { RunId, ChatId, ModelId } from '../common/id.contract';
import type { IsoDateTimeString } from '../common/datetime.contract';
import type { PagedResponse, PageRequest } from '../common/pagination.contract';

export type RunState = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
// WICHTIG: Du hast aktuell im Backend "canceled" (US) in DTO enums,
// aber im Contract steht "cancelled" (UK). Entscheide dich für eins.
// Ich würde "canceled" nehmen, weil dein Code es schon nutzt.

export interface RunStatus {
  id: RunId;
  chatId: ChatId;

  queueKey: string;
  status: RunState;

  clientRequestId: string | null;
  settingsProfileId: string | null;

  settingsSnapshot: Record<string, any>;

  sourceMessageId: string | null;
  targetMessageId: string | null;
  headMessageIdAtStart: string | null;

  lockedBy: string | null;
  lockedAt: IsoDateTimeString | null;

  startedAt: IsoDateTimeString | null;
  finishedAt: IsoDateTimeString | null;

  error: string | null;
  stats: any;

  createdVariantId: string | null;

  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

/** If you still need list items/detail in the UI, keep them too, but avoid name collisions. */
export interface RunListItem {
  id: RunId;
  status: RunState;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;

  chatId?: ChatId;
  modelId?: ModelId;
  title?: string;
}

export interface RunDetail extends RunListItem {
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorDetails?: { message: string; stack?: string };
  metrics?: {
    durationMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface ListRunsRequest extends Partial<PageRequest> {
  status?: RunState;
  chatId?: ChatId;
  modelId?: ModelId;
}

export type ListRunsResponse = PagedResponse<RunListItem>;

export interface CreateRunRequest {
  chatId?: ChatId;
  modelId?: ModelId;
  payload?: Record<string, unknown>;
}

export interface CreateRunResponse {
  run: RunDetail;
}

export interface GetRunResponse {
  run: RunDetail;
}

export interface CancelRunResponse {
  run: Pick<RunStatus, 'id' | 'status' | 'updatedAt'>;
  message?: string | null;
}
