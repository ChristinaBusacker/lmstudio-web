import type { RunState, ThreadMessage } from '@shared/contracts';
import { JsonObject } from '@shared/index';

export interface ChatDetailStateModel {
  chatId: string | null;

  loading: boolean;
  includeReasoning: boolean;

  meta: {
    title: string | null;
    folderId: string | null;
    activeHeadMessageId: string | null;
  } | null;

  /**
   * We store messages as array for easy rendering, and a map for fast patching.
   * Keep them consistent.
   */
  messages: ThreadMessage[];
  messageById: Record<string, ThreadMessage>;

  /** last run status we saw for this chat (optional but handy for UI) */
  runs: Record<
    string,
    {
      runId: string;
      status: RunState;
      stats?: JsonObject | null;
      error?: string | null;
      updatedAt: string;
    }
  >;

  /**
   * Best-effort UI hint to show a nicer status message while a run is queued.
   * This is NOT sent to the backend.
   */
  pendingModelKey: string | null;

  lastSyncAt: string | null;
  error: string | null;
}

export interface SendMessagePayload {
  content: string;
  clientRequestId: string;
  settingsProfileId?: string;
  settingsSnapshot?: JsonObject;
}
