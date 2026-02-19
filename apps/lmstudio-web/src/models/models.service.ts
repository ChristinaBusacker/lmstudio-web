import { Injectable, ServiceUnavailableException, NotFoundException } from '@nestjs/common';
import {
  ModelListItemDto,
  ModelDetailsDto,
  LoadedModelInstanceDto,
  LoadModelDto,
  LoadModelResponseDto,
  UnloadModelDto,
  UnloadModelResponseDto,
} from './dto/model.dto';
import { SseBusService } from '../sse/sse-bus.service';
import { ConfigService } from '@nestjs/config';

import type {
  LlmModelInfo,
  ModelListResponse,
  ModelLoadResponse,
  ModelLoadState,
  ModelUnloadResponse,
} from '@shared/index';

/**
 * Integrates with LM Studio via REST v1:
 * - List models:   GET  /api/v1/models
 * - Load model:    POST /api/v1/models/load
 * - Unload model:  POST /api/v1/models/unload
 *
 * Note: v1 does not document a "get one model" endpoint, so getModel()
 * is derived from listModels().
 */
@Injectable()
export class ModelsService {
  private readonly baseUrl: string;
  private readonly apiToken?: string;

  constructor(
    private sse: SseBusService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config
      .get<string>('LMSTUDIO_BASE_URL', 'http://127.0.0.1:1234')
      .replace(/\/+$/, '');

    // Optional: if LM Studio server requires auth token
    this.apiToken = this.config.get<string>('LMSTUDIO_API_TOKEN');
  }

  private buildHeaders(isJsonBody: boolean): HeadersInit {
    const headers: Record<string, string> = {};
    if (isJsonBody) headers['Content-Type'] = 'application/json';
    if (this.apiToken) headers['Authorization'] = `Bearer ${this.apiToken}`;
    return headers;
  }

  private async requestJson<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let res: Response;

    try {
      res = await fetch(url, {
        method,
        headers: this.buildHeaders(method === 'POST'),
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'LMSTUDIO_UNREACHABLE',
        message: 'Unable to connect to LM Studio.',
        baseUrl: this.baseUrl,
      });
    }

    if (!res.ok) {
      throw new ServiceUnavailableException({
        code: 'LMSTUDIO_ERROR',
        message: `LM Studio responded with ${res.status} ${res.statusText}.`,
        baseUrl: this.baseUrl,
        detail: `${method} ${path}`,
      });
    }

    return (await res.json()) as T;
  }

  private mapRestModelToDto(m: LlmModelInfo): ModelListItemDto {
    const state: ModelLoadState =
      m.state === 'loaded' || m.state === 'not-loaded' ? (m.state as any) : 'unknown';

    return {
      id: m.key,
      type: m.type,
      publisher: m.publisher ?? undefined,
      arch: m.type === 'llm' ? m.architecture : undefined,
      quantization: m.quantization?.name ?? undefined,
      state,
      maxContextLength: m.max_context_length,
    };
  }

  /**
   * Lists models visible to LM Studio, including downloaded + loaded.
   * REST v1: GET /api/v1/models
   */
  async listModels(): Promise<ModelListItemDto[]> {
    const json = await this.requestJson<ModelListResponse>('GET', '/api/v1/models');
    return (json.models ?? []).map((m) => this.mapRestModelToDto(m));
  }

  /**
   * Gets model info for a single model.
   * v1 does not document GET /api/v1/models/{id}, so we derive it from list.
   */
  async getModel(id: string): Promise<ModelDetailsDto> {
    const json = await this.requestJson<ModelListResponse>('GET', '/api/v1/models');
    const m = (json.models ?? []).find((x) => x.key === id);

    if (!m) throw new NotFoundException(`Model not found in LM Studio: ${id}`);

    const base = this.mapRestModelToDto(m);

    return {
      ...base,
      // Not available from v1 model list contract
      compatibilityType: undefined,
    };
  }

  /**
   * Lists currently loaded model instances (LLMs + embeddings).
   * Derived from v1 model list: each model has loaded_instances[].
   */
  async listLoaded(): Promise<LoadedModelInstanceDto[]> {
    const json = await this.requestJson<ModelListResponse>('GET', '/api/v1/models');

    const out: LoadedModelInstanceDto[] = [];

    for (const model of json.models ?? []) {
      const instances = Array.isArray(model.loaded_instances) ? model.loaded_instances : [];

      const isObject = (v: unknown): v is Record<string, unknown> =>
        typeof v === 'object' && v !== null;
      for (const inst of instances) {
        // Docs: loaded_instances entries contain "id" (instance identifier) and "config" :contentReference[oaicite:2]{index=2}
        const instanceId =
          isObject(inst) && typeof inst['id'] === 'string' ? (inst['id'] as string) : undefined;

        out.push({
          id: model.key, // model identifier
          identifier: instanceId, // instance identifier
          type: model.type,
        });
      }
    }

    // Filter out entries without an instance identifier
    return out.filter((x) => x.id && x.identifier);
  }

  /**
   * Loads a model via REST v1: POST /api/v1/models/load
   *
   * Note: REST v1 load supports:
   * - model (required)
   * - context_length, eval_batch_size, flash_attention, num_experts, offload_kv_cache_to_gpu, echo_load_config :contentReference[oaicite:3]{index=3}
   *
   * Your LoadModelDto has fields like identifier/ttl/gpu/forceNewInstance which are SDK-ish.
   * We map what we can (contextLength -> context_length) and ignore unsupported fields.
   */
  async loadModel(id: string, dto: LoadModelDto): Promise<LoadModelResponseDto> {
    // Nice UX error: validate exists
    const list = await this.listModels();
    const exists = list.some((m) => m.id === id);
    if (!exists) throw new NotFoundException(`Model not found in LM Studio: ${id}`);

    this.sse.publish({
      type: 'models.changed',
      payload: { reason: 'model-loading-started', modelId: id, state: 'loading' },
    });

    const payload: Record<string, unknown> = {
      model: id,
      // include final config for debugging / transparency if you want it
      echo_load_config: true,
    };

    if (typeof dto.contextLength === 'number') payload.context_length = dto.contextLength;

    // REST v1 does not support dto.identifier/ttl/gpu/forceNewInstance directly.
    const res = await this.requestJson<ModelLoadResponse>('POST', '/api/v1/models/load', payload);

    this.sse.publish({
      type: 'models.changed',
      payload: { reason: 'model-loaded', modelId: id, state: 'loaded' },
    });

    return {
      id,
      // We treat "identifier" as the instance id, since that's what unload needs.
      identifier: res.instance_id,
      state: 'loaded',
    };
  }

  /**
   * Unloads a loaded model instance via REST v1: POST /api/v1/models/unload :contentReference[oaicite:4]{index=4}
   *
   * If dto.identifier is provided, it is treated as instance_id.
   * Otherwise we unload the first loaded instance for that model.
   */
  async unloadModel(id: string, dto: UnloadModelDto): Promise<UnloadModelResponseDto> {
    const loaded = await this.listLoaded();

    const match = dto.identifier
      ? loaded.find((m) => m.id === id && m.identifier === dto.identifier)
      : loaded.find((m) => m.id === id);

    if (!match?.identifier) {
      // Already not loaded (idempotent-ish)
      return { id, identifier: dto.identifier, state: 'not-loaded' };
    }

    this.sse.publish({
      type: 'models.changed',
      payload: { reason: 'model-unloading-started', modelId: id, state: 'unloading' },
    });

    const res = await this.requestJson<ModelUnloadResponse>('POST', '/api/v1/models/unload', {
      instance_id: match.identifier,
    });

    this.sse.publish({
      type: 'models.changed',
      payload: { reason: 'model-unloaded', modelId: id, state: 'not-loaded' },
    });

    return { id, identifier: res.instance_id, state: 'not-loaded' };
  }
}
