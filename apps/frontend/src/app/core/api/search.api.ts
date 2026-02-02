export type SearchChatMatchType = 'title' | 'user_message' | 'assistant_message';

export interface SearchChatsQuery {
  term: string;
  limit?: number; // default 20, min 1, max 100
  includeSnippets?: boolean; // default false
  includeDeleted?: boolean; // default false
}

export interface SearchChatMatchDto {
  type: SearchChatMatchType;
  /**
   * Optional snippet around the match.
   * OpenAPI says "object | null" — keep it flexible.
   */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  snippet: string | null;
}

export interface SearchChatResultDto {
  chatId: string;

  /**
   * OpenAPI schema for title/folderId is oddly "object | null".
   * In practice this is almost certainly "string | null".
   * Keep it strict but realistic; adjust if your backend really returns objects.
   */
  title: string | null;
  folderId: string | null;
  folderTitle?: string;
  updatedAt: string; // ISO string
  score: number;
  matches: SearchChatMatchDto[];
}

// chat-search-api.service.ts

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ChatSearchApiService {
  private readonly baseUrl = '/api/search/chats';

  constructor(private readonly http: HttpClient) {}

  searchChats(query: SearchChatsQuery): Observable<SearchChatResultDto[]> {
    // Note: Backend requires `term`.
    let params = new HttpParams().set('term', query.term);

    if (query.limit != null) params = params.set('limit', String(query.limit));
    if (query.includeSnippets != null)
      params = params.set('includeSnippets', String(query.includeSnippets));
    if (query.includeDeleted != null)
      params = params.set('includeDeleted', String(query.includeDeleted));

    return this.http.get<SearchChatResultDto[]>(this.baseUrl, { params });
  }
}
