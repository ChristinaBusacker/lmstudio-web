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

/**
 * Stream chunk from the model server.
 * - delta: visible output text
 * - reasoningDelta: optional "thinking"/reasoning channel (if server provides it)
 */
export interface StreamDelta {
  delta: string;
  reasoningDelta?: string;
}

export interface RunStats {
  stopReason?: string;
  predictedTokensCount?: number;
  timeToFirstTokenSec?: number;
  modelDisplayName?: string;
}
