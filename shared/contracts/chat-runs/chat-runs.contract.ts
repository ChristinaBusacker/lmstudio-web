import type { IsoDateTimeString } from '../common/datetime.contract';
import type { RunState } from '../runs/run.contract';

export interface EnqueueRunResponse {
  runId: string;
  chatId: string;

  sourceMessageId: string | null;
  targetMessageId: string | null;
  headMessageIdAtStart: string | null;

  queueKey: string;
  status: RunState;
  createdAt: IsoDateTimeString;
}

export interface RegenerateRequest {
  clientRequestId: string;
  settingsProfileId?: string;
}

export interface ChatRunSendMessageRequest {
  content: string;
  clientRequestId: string;
  settingsProfileId?: string;
  settingsSnapshot?: Record<string, any>;
}
