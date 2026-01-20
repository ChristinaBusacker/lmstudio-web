import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ThreadVariantDto {
  id: string;
  variantIndex: number;
  isActive: boolean;
  content: string;
  reasoning?: string | null;
  stats?: any;
  createdAt: string;
}

export interface ThreadMessageDto {
  id: string;
  chatId: string;
  role: ChatRole;
  parentMessageId?: string | null;
  deletedAt?: string | null;
  editedAt?: string | null;
  variantsCount: number;
  createdAt: string;
  activeVariant: ThreadVariantDto;
}

export interface ChatThreadResponseDto {
  chatId: string;
  title?: string | null;
  folderId?: string | null;
  activeHeadMessageId?: string | null;
  messages: ThreadMessageDto[];
}

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
