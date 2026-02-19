export interface ModelListResponse {
  models: ModelInfo[];
}

export type ModelType = 'embedding' | 'llm';

export interface QuantizationInfo {
  name: string;
  bits_per_weight: number;
}

/**
 * Present on LLM entries, contains feature flags.
 */
export interface ModelCapabilities {
  vision: boolean;
  trained_for_tool_use: boolean;
}

export interface ModelInfoBase {
  type: ModelType;
  publisher: string;
  key: string;
  display_name: string;

  quantization: QuantizationInfo;

  size_bytes: number;
  params_string: string | null;

  loaded_instances: unknown[];

  max_context_length: number;
  format: string;
}

export interface LlmModelInfo extends ModelInfoBase {
  type: 'llm' | 'embedding';

  architecture: string;
  capabilities: ModelCapabilities;
  description: string | null;

  variants?: string[];
  selected_variant?: string;

  state: ModelLoadState;
}

export type ModelLoadState = 'loaded' | 'not-loaded' | 'unknown';

export type ModelInfo = LlmModelInfo;

// ---- Load / unload ----

export interface ModelLoadConfig {
  context_length?: number;
  eval_batch_size?: number;
  flash_attention?: boolean;
  num_experts?: number;
  offload_kv_cache_to_gpu?: boolean;
  // optional: allow future keys without breaking compile
  // [key: string]: unknown;
}

export type ModelLoadStatus = 'loaded' | 'loading' | 'failed' | string;

export interface ModelLoadResponse {
  type: ModelType; // in deinem Beispiel "llm"
  instance_id: string;
  load_time_seconds?: number;
  status?: ModelLoadStatus;
  load_config?: ModelLoadConfig;
}

export interface ModelUnloadResponse {
  instance_id: string;
}
