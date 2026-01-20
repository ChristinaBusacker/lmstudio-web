import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface EnqueueRunResponseDto {
  runId: string;
  chatId: string;
  sourceMessageId?: string | null;
  targetMessageId?: string | null;
  headMessageIdAtStart?: string | null;
  queueKey: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  createdAt: string;
}

export interface SendMessageDto {
  content: string;
  clientRequestId: string;
  settingsProfileId?: string;
  settingsSnapshot?: Record<string, any>;
}

export interface RegenerateDto {
  clientRequestId: string;
  settingsProfileId?: string;
}

export interface ActivateHeadDto {
  messageId?: string | null;
}

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
