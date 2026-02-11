import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  LmModelListItem,
  LoadedModelInstance,
  LoadModelRequest,
  LoadModelResponse,
  UnloadModelRequest,
  UnloadModelResponse,
} from '@shared/contracts';

/**
 * Mirrors the server-side OpenAPI model DTOs.
 * Keep these minimal and stable; the server is the source of truth.
 */
export type ModelListItemDto = LmModelListItem;

export type LoadedModelInstanceDto = LoadedModelInstance;

export type LoadModelDto = LoadModelRequest;

export type LoadModelResponseDto = LoadModelResponse;

export type UnloadModelDto = UnloadModelRequest;

export type UnloadModelResponseDto = UnloadModelResponse;

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
