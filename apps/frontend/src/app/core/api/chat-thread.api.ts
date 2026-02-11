import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type { ThreadVariant, ThreadMessage, ChatThreadResponse } from '@shared/contracts';

export type ChatRole = 'system' | 'user' | 'assistant';

export type ThreadVariantDto = ThreadVariant;

export type ThreadMessageDto = ThreadMessage;

export type ChatThreadResponseDto = ChatThreadResponse;

@Injectable({ providedIn: 'root' })
export class ChatThreadApi {
  private readonly http = inject(HttpClient);

  getThread(
    chatId: string,
    opts?: { includeReasoning?: boolean },
  ): Observable<ChatThreadResponseDto> {
    let params = new HttpParams();
    if (opts?.includeReasoning != null) {
      params = params.set('includeReasoning', String(opts.includeReasoning));
    }
    return this.http.get<ChatThreadResponseDto>(`/api/chats/${encodeURIComponent(chatId)}/thread`, {
      params,
    });
  }
}
