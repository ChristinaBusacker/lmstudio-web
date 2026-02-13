import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ChatListItem,
  ChatMeta,
  CreateChatRequest,
  MoveChatRequest,
  RenameChatRequest,
  SoftDeleteChatResponse,
} from '@shared/contracts';
import { Observable } from 'rxjs';

export interface ChatExportBundleDto {
  version: number;
  title: string | null;
  defaultSettingsProfileId: string | null;
  activeHeadMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  messages: Array<{
    id: string;
    role: 'system' | 'user' | 'assistant';
    parentMessageId: string | null;
    deletedAt: string | null;
    editedAt: string | null;
    createdAt: string;
    variants: Array<{
      id: string;
      variantIndex: number;
      isActive: boolean;
      content: string;
      reasoning: string | null;
      stats: any;
      createdAt: string;
    }>;
  }>;
}

export type ChatListItemDto = ChatListItem;

export type CreateChatDto = CreateChatRequest;

export type ChatMetaDto = ChatMeta;

export type RenameChatDto = RenameChatRequest;

export type MoveChatDto = MoveChatRequest;

@Injectable({ providedIn: 'root' })
export class ChatsApi {
  private readonly http = inject(HttpClient);

  list(params?: {
    limit?: number;
    cursor?: string;
    folderId?: string | null;
    includeDeleted?: boolean;
  }): Observable<ChatListItemDto[]> {
    let p = new HttpParams();

    if (params?.limit != null) p = p.set('limit', String(params.limit));
    if (params?.cursor) p = p.set('cursor', params.cursor);

    // IMPORTANT: backend expects "null" literal to filter for chats without folder
    if (params?.folderId === null) p = p.set('folderId', 'null');
    else if (typeof params?.folderId === 'string') p = p.set('folderId', params.folderId);

    if (params?.includeDeleted != null) p = p.set('includeDeleted', String(params.includeDeleted));

    return this.http.get<ChatListItemDto[]>('/api/chats', { params: p });
  }

  create(dto: CreateChatDto): Observable<ChatMetaDto> {
    return this.http.post<ChatMetaDto>('/api/chats', dto);
  }

  rename(id: string, dto: RenameChatDto): Observable<ChatMetaDto> {
    return this.http.patch<ChatMetaDto>(`/api/chats/${encodeURIComponent(id)}`, dto);
  }

  move(id: string, dto: MoveChatDto): Observable<void> {
    return this.http.patch<void>(`/api/chats/${encodeURIComponent(id)}/move`, dto);
  }

  softDelete(id: string): Observable<SoftDeleteChatResponse> {
    return this.http.delete<SoftDeleteChatResponse>(`/api/chats/${encodeURIComponent(id)}`);
  }

  exportChat(id: string): Observable<ChatExportBundleDto> {
    return this.http.get<ChatExportBundleDto>(`/api/chats/${encodeURIComponent(id)}/export`);
  }

  importChat(bundle: ChatExportBundleDto): Observable<ChatMetaDto> {
    return this.http.post<ChatMetaDto>(`/api/chats/import`, bundle);
  }

  branchChat(chatId: string, messageId: string): Observable<{ chatId: string }> {
    return this.http.post<{ chatId: string }>(`/api/chats/${encodeURIComponent(chatId)}/branch`, {
      messageId,
    });
  }
}
