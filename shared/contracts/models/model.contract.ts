import type { ModelId } from '../common/id.contract';
import type { PagedResponse, PageRequest } from '../common/pagination.contract';

export type ModelKind = 'llm' | 'embedding' | 'vision' | 'audio' | 'unknown';

export interface ModelListItem {
  id: ModelId;
  name: string;
  kind: ModelKind;
  /** Provider/engine identifier (e.g. "lmstudio", "ollama", etc.) */
  provider?: string;
  /** Optional flags for UI (downloaded, loaded, default, etc.) */
  tags?: string[];
}

export interface ModelDetail extends ModelListItem {
  description?: string;
  contextWindow?: number;
  parameters?: Record<string, unknown>;
}

export interface ListModelsRequest extends Partial<PageRequest> {
  q?: string;
  kind?: ModelKind;
}

export type ListModelsResponse = PagedResponse<ModelListItem>;

export interface GetModelResponse {
  model: ModelDetail;
}
