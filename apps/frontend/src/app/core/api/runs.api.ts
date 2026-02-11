import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CancelRunResponse } from '@shared/contracts';
import { Observable } from 'rxjs';
import type { RunStatusDto } from '../state/runs/runs.model';

export type CancelRunResponseDto = CancelRunResponse;

@Injectable({ providedIn: 'root' })
export class RunsApiService {
  private readonly http = inject(HttpClient);

  listActive(queueKey = 'default', limit = 50): Observable<RunStatusDto[]> {
    const params = new HttpParams().set('queueKey', queueKey).set('limit', String(limit));
    return this.http.get<RunStatusDto[]>('/api/runs/active', { params });
  }

  listByChat(chatId: string, limit = 20): Observable<RunStatusDto[]> {
    const params = new HttpParams().set('limit', String(limit));
    return this.http.get<RunStatusDto[]>(`/api/chats/${chatId}/runs`, { params });
  }

  getById(runId: string): Observable<RunStatusDto> {
    return this.http.get<RunStatusDto>(`/api/runs/${runId}`);
  }

  cancel(runId: string): Observable<CancelRunResponseDto> {
    return this.http.post<CancelRunResponseDto>(`/api/runs/${runId}/cancel`, {});
  }
}
