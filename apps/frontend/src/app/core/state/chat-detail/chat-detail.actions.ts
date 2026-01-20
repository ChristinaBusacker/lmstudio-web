import type { EnqueueRunResponseDto } from '../../api/chat-runs.api';

export class OpenChat {
  static readonly type = '[ChatDetail] Open Chat';
  constructor(public readonly chatId: string) {}
}

export class CloseChat {
  static readonly type = '[ChatDetail] Close Chat';
}

export class LoadThread {
  static readonly type = '[ChatDetail] Load Thread';
  constructor(
    public readonly chatId: string,
    public readonly opts?: { includeReasoning?: boolean },
  ) {}
}

export class SendMessage {
  static readonly type = '[ChatDetail] Send Message';
  constructor(
    public readonly chatId: string,
    public readonly payload: {
      content: string;
      clientRequestId: string;
      settingsProfileId?: string;
      settingsSnapshot?: Record<string, any>;
    },
  ) {}
}

export class RegenerateAssistantMessage {
  static readonly type = '[ChatDetail] Regenerate Assistant Message';
  constructor(
    public readonly messageId: string,
    public readonly payload: { clientRequestId: string; settingsProfileId?: string },
  ) {}
}

export class ActivateHead {
  static readonly type = '[ChatDetail] Activate Head';
  constructor(
    public readonly chatId: string,
    public readonly messageId: string | null,
  ) {}
}

export class ApplyVariantSnapshotFromSse {
  static readonly type = '[ChatDetail] Apply Variant Snapshot (SSE)';
  constructor(
    public readonly payload: {
      chatId: string;
      runId?: string;
      messageId: string;
      content: string;
      reasoning: string | null;
    },
  ) {}
}

export class ApplyRunStatusFromSse {
  static readonly type = '[ChatDetail] Apply Run Status (SSE)';
  constructor(
    public readonly payload: {
      chatId: string;
      runId: string;
      status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
      stats?: any;
      error?: string | null;
    },
  ) {}
}

export class EnqueuedRunLocal {
  static readonly type = '[ChatDetail] Enqueued Run (Local)';
  constructor(public readonly res: EnqueueRunResponseDto) {}
}
