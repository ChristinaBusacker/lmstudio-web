import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import type {
  EnqueueRunResponse,
  ChatSendMessageRequest,
  RegenerateRequest,
  ActivateHeadRequest,
} from '@shared/contracts';

export type EnqueueRunResponseDto = EnqueueRunResponse;

export type SendMessageDto = ChatSendMessageRequest;

export type RegenerateDto = RegenerateRequest;

export type ActivateHeadDto = ActivateHeadRequest;

@Injectable({ providedIn: 'root' })
export class ChatRunsApi {
  private readonly http = inject(HttpClient);

  send(chatId: string, dto: SendMessageDto): Observable<EnqueueRunResponseDto> {
    return this.http.post<EnqueueRunResponseDto>(
      `/api/chats/${encodeURIComponent(chatId)}/send`,
      dto,
    );
  }

  regenerate(messageId: string, dto: RegenerateDto): Observable<EnqueueRunResponseDto> {
    return this.http.post<EnqueueRunResponseDto>(
      `/api/messages/${encodeURIComponent(messageId)}/regenerate`,
      dto,
    );
  }

  activateHead(
    chatId: string,
    dto: ActivateHeadDto,
  ): Observable<{ chatId: string; activeHeadMessageId: string | null }> {
    return this.http.post<{ chatId: string; activeHeadMessageId: string | null }>(
      `/api/chats/${encodeURIComponent(chatId)}/activate-head`,
      dto,
    );
  }
}
