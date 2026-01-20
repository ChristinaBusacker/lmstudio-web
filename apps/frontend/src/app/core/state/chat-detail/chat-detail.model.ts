import type { ThreadMessageDto } from '../../api/chat-thread.api';

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
  messages: ThreadMessageDto[];
  messageById: Record<string, ThreadMessageDto>;

  /** last run status we saw for this chat (optional but handy for UI) */
  runs: Record<
    string,
    {
      runId: string;
      status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
      stats?: any;
      error?: string | null;
      updatedAt: string;
    }
  >;

  lastSyncAt: string | null;
  error: string | null;
}
