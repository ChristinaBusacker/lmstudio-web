// src/app/core/state/runs/runs.actions.ts
import type { RunStatusDto } from './runs.model';

export class LoadActiveRuns {
  static readonly type = '[Runs] Load Active Runs';
  constructor(
    public readonly queueKey: string = 'default',
    public readonly limit: number = 50,
  ) {}
}

export class LoadChatRuns {
  static readonly type = '[Runs] Load Chat Runs';
  constructor(
    public readonly chatId: string,
    public readonly limit: number = 20,
  ) {}
}

export class UpsertRunFromSse {
  static readonly type = '[Runs] Upsert Run From SSE';
  constructor(public readonly run: RunStatusDto) {}
}

/**
 * Optional: if you want SSE to only send patches later,
 * keep a patch action ready. For now, we upsert full dto.
 */
export class PatchRunFromSse {
  static readonly type = '[Runs] Patch Run From SSE';
  constructor(
    public readonly runId: string,
    public readonly patch: Partial<RunStatusDto>,
  ) {}
}

export class CancelRun {
  static readonly type = '[Runs] Cancel Run';
  constructor(public readonly runId: string) {}
}
