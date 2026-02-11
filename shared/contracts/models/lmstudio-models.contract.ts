export type LmModelState = 'loaded' | 'not-loaded' | 'unknown';

export interface LmModelListItem {
  id: string;
  type?: string;
  publisher?: string;
  arch?: string;
  quantization?: string;
  state: LmModelState;
  maxContextLength?: number;
}

export interface LmModelDetails extends LmModelListItem {
  compatibilityType?: string;
}

export interface LoadModelRequest {
  identifier?: string;
  ttl?: number;
  contextLength?: number;
  gpu?: string;
  forceNewInstance?: boolean;
}

export interface UnloadModelRequest {
  identifier?: string;
}

export interface LoadedModelInstance {
  id: string;
  identifier?: string;
  type?: string;
}

export interface LoadModelResponse {
  id: string;
  identifier?: string;
  state: 'loaded';
}

export interface UnloadModelResponse {
  id: string;
  identifier?: string;
  state: 'not-loaded';
}
