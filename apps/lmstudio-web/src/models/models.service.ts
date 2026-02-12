/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, ServiceUnavailableException, NotFoundException } from '@nestjs/common';
import { LMStudioClient } from '@lmstudio/sdk';
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

/**
 * Integrates with LM Studio:
 * - List/status via REST API v0 (/api/v0/models)
 * - Load/unload via @lmstudio/sdk (since REST v0 does not expose load/unload endpoints)
 */
@Injectable()
export class ModelsService {
  private readonly baseUrl: string;
  private readonly client: LMStudioClient;

  constructor(
    private sse: SseBusService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config
      .get<string>('LMSTUDIO_BASE_URL', 'http://127.0.0.1:1234')
      .replace(/\/+$/, '');
    this.client = new LMStudioClient(); // uses local LM Studio default connection
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let res: Response;

    try {
      res = await fetch(url, { method: 'GET' });
    } catch (e: unknown) {
      console.log(e);
      throw new ServiceUnavailableException(
        `LM Studio is not reachable at ${this.baseUrl}. Is the server running?`,
      );
    }

    if (!res.ok) {
      throw new ServiceUnavailableException(
        `LM Studio request failed: GET ${path} -> ${res.status} ${res.statusText}`,
      );
    }

    return (await res.json()) as T;
  }

  private mapRestModelToDto(m: any): ModelListItemDto {
    return {
      id: String(m.id),
      type: m.type ? String(m.type) : undefined,
      publisher: m.publisher ? String(m.publisher) : undefined,
      arch: m.arch ? String(m.arch) : undefined,
      quantization: m.quantization ? String(m.quantization) : undefined,
      state: m.state === 'loaded' || m.state === 'not-loaded' ? m.state : 'unknown',
      maxContextLength: typeof m.max_context_length === 'number' ? m.max_context_length : undefined,
    };
  }

  /**
   * Lists models visible to LM Studio, including downloaded + loaded.
   * Uses LM Studio REST API v0: GET /api/v0/models
   */
  async listModels(): Promise<ModelListItemDto[]> {
    const json = await this.fetchJson<{ object: 'list'; data: any[] }>('/api/v0/models');
    return (json.data ?? []).map((m) => this.mapRestModelToDto(m));
  }

  /**
   * Gets model info for a single model.
   * Uses LM Studio REST API v0: GET /api/v0/models/:id
   */
  async getModel(id: string): Promise<ModelDetailsDto> {
    // REST has /api/v0/models/{model}
    const m = await this.fetchJson<any>(`/api/v0/models/${encodeURIComponent(id)}`);
    const base = this.mapRestModelToDto(m);

    return {
      ...base,
      compatibilityType: m.compatibility_type ? String(m.compatibility_type) : undefined,
    };
  }

  /**
   * Lists currently loaded model instances (LLMs + embeddings).
   * Uses LM Studio SDK (equivalent to `lms ps`).
   */
  async listLoaded(): Promise<LoadedModelInstanceDto[]> {
    // Note: SDK types aren’t fully stable across versions → keep mapping defensive.
    const llms = await this.client.llm.listLoaded();
    const embeds = await this.client.embedding.listLoaded();

    const mapAny = (x: any, type?: string): LoadedModelInstanceDto => ({
      id: String(x?.id ?? x?.modelKey ?? x?.model ?? ''),
      identifier: x?.identifier ? String(x.identifier) : undefined,
      type,
    });

    const out: LoadedModelInstanceDto[] = [];
    for (const x of llms as any[]) out.push(mapAny(x, 'llm'));
    for (const x of embeds as any[]) out.push(mapAny(x, 'embeddings'));
    return out.filter((x) => x.id);
  }

  /**
   * Loads (or ensures loaded) a model.
   * - If forceNewInstance=false (default): uses `.model(id)` → returns loaded if already loaded, or loads if not.
   * - If forceNewInstance=true: uses `.load(id, config)` → always creates a new instance (advanced).
   */
  async loadModel(id: string, dto: LoadModelDto): Promise<LoadModelResponseDto> {
    // Optional: validate exists in REST listing (nice UX error)
    const list = await this.listModels();
    const exists = list.some((m) => m.id === id);
    if (!exists) throw new NotFoundException(`Model not found in LM Studio: ${id}`);

    this.sse.publish({
      type: 'models.changed',
      payload: { reason: 'model-loading-started', modelId: id, state: 'loading' },
    });

    const config: Record<string, any> = {};
    if (dto.identifier) config.identifier = dto.identifier;
    if (typeof dto.ttl === 'number') config.ttl = dto.ttl;
    if (typeof dto.contextLength === 'number') config.contextLength = dto.contextLength;
    if (dto.gpu) config.gpu = dto.gpu;

    if (dto.forceNewInstance) {
      const handle = await this.client.llm.load(id, config);
      return {
        id,
        identifier: (handle as any)?.identifier
          ? String((handle as any).identifier)
          : dto.identifier,
        state: 'loaded',
      };
    }

    // `.model(id)` loads if not loaded, or returns existing
    const handle = await this.client.llm.model(id);

    this.sse.publish({
      type: 'models.changed',
      payload: { reason: 'model-loaded', modelId: id, state: 'loaded' },
    });

    return {
      id,
      identifier: (handle as any)?.identifier ? String((handle as any).identifier) : dto.identifier,
      state: 'loaded',
    };
  }

  /**
   * Unloads a loaded model instance.
   * If identifier is provided, unload that specific instance.
   * Otherwise unload the first loaded instance matching id.
   */
  async unloadModel(id: string, dto: UnloadModelDto): Promise<UnloadModelResponseDto> {
    // Find loaded instance by REST state first (fast path) OR SDK listLoaded for identifier routing
    const loaded = await this.listLoaded();

    const match = dto.identifier
      ? loaded.find((m) => m.id === id && m.identifier === dto.identifier)
      : loaded.find((m) => m.id === id);

    if (!match) {
      // Already not loaded (idempotent-ish)
      return { id, identifier: dto.identifier, state: 'not-loaded' };
    }

    this.sse.publish({
      type: 'models.changed',
      payload: { reason: 'model-unloading-started', modelId: id, state: 'unloading' },
    });

    // SDK: need a handle to call unload()
    // We obtain a handle via `.model()` if no identifier, or via `.load()`/model lookup if needed.
    // Practical approach for V1: get any handle for that model and unload it (single-instance UX).
    const handle = await this.client.llm.model(id);
    await (handle as any).unload();

    this.sse.publish({
      type: 'models.changed',
      payload: { reason: 'model-unloaded', modelId: id, state: 'not-loaded' },
    });

    return { id, identifier: match.identifier, state: 'not-loaded' };
  }
}
