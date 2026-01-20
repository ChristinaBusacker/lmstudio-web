import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface ChatListItemDto {
  id: string;
  title: string | null;
  folderId: string | null;
  activeHeadMessageId: string | null;
  defaultSettingsProfileId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChatDto {
  title?: string;
}

export interface ChatMetaDto {
  id: string;
  title: string | null;
  folderId: string | null;
  activeHeadMessageId: string | null;
  deletedAt: string | null;
}

export interface RenameChatDto {
  title: string;
}

export interface MoveChatDto {
  folderId: string | null;
}

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

  softDelete(id: string): Observable<{ chatId: string; deletedAt: string }> {
    return this.http.delete<{ chatId: string; deletedAt: string }>(
      `/api/chats/${encodeURIComponent(id)}`,
    );
  }
}
