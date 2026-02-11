import type { RunState, ThreadMessage } from '@shared/contracts';

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
      stats?: any;
      error?: string | null;
      updatedAt: string;
    }
  >;

  lastSyncAt: string | null;
  error: string | null;
}
