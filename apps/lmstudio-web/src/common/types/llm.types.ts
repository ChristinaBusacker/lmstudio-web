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

  /** Optional: LM Studio gpt-oss reasoning control (only used on /v1/responses path) */
  reasoningEffort?: 'low' | 'medium' | 'high';

  /**
   * Structured Output (LM Studio: json_schema enforcement on /v1/chat/completions).
   * Example:
   * structuredOutput: { enabled: true, strict: true, name: 'my_schema', schema: { ... } }
   */
  structuredOutput?: {
    enabled: boolean;
    strict?: boolean;
    name?: string;
    schema?: Record<string, any>;
  };
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
