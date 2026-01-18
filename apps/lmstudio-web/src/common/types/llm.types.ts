export type LmRole = 'system' | 'user' | 'assistant';

export interface LmMessage {
  role: LmRole;
  content: string; // content-only, reasoning excluded
}

export interface RunParams {
  modelKey?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface StreamDelta {
  delta: string;
}

export interface RunStats {
  stopReason?: string;
  predictedTokensCount?: number;
  timeToFirstTokenSec?: number;
  modelDisplayName?: string;
}
