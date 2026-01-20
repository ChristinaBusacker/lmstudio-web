import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * Mirrors the server-side OpenAPI model DTOs.
 * Keep these minimal and stable; the server is the source of truth.
 */
export interface ModelListItemDto {
  id: string;
  type?: string;
  publisher?: string;
  arch?: string;
  quantization?: string;
  state: 'loaded' | 'not-loaded' | 'unknown';
  maxContextLength?: number;
}

export interface LoadedModelInstanceDto {
  id: string;
  identifier?: string;
  type?: string;
}

export interface LoadModelDto {
  identifier?: string;
  ttl?: number;
  contextLength?: number;
  gpu?: string;
  forceNewInstance?: boolean;
}

export interface LoadModelResponseDto {
  id: string;
  identifier?: string;
  state: 'loaded';
}

export interface UnloadModelDto {
  identifier?: string;
}

export interface UnloadModelResponseDto {
  id: string;
  identifier?: string;
  state: 'not-loaded';
}

@Injectable({ providedIn: 'root' })
export class ModelsApi {
  private readonly http = inject(HttpClient);

  list(): Observable<ModelListItemDto[]> {
    return this.http.get<ModelListItemDto[]>('/api/models');
  }

  loaded(): Observable<LoadedModelInstanceDto[]> {
    return this.http.get<LoadedModelInstanceDto[]>('/api/models/loaded');
  }

  load(id: string, dto: LoadModelDto): Observable<LoadModelResponseDto> {
    return this.http.post<LoadModelResponseDto>(`/api/models/${encodeURIComponent(id)}/load`, dto);
  }

  unload(id: string, dto: UnloadModelDto): Observable<UnloadModelResponseDto> {
    return this.http.post<UnloadModelResponseDto>(
      `/api/models/${encodeURIComponent(id)}/unload`,
      dto,
    );
  }
}
