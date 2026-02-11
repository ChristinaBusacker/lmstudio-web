import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  SearchChatsQuery as SearchChatsQueryContract,
  SearchChatMatch as SearchChatMatchContract,
  SearchChatResult as SearchChatResultContract,
} from '@shared/contracts';

export type SearchChatMatchType = 'title' | 'user_message' | 'assistant_message';

export type SearchChatsQuery = SearchChatsQueryContract;
export type SearchChatMatchDto = SearchChatMatchContract;
export type SearchChatResultDto = SearchChatResultContract;

@Injectable({ providedIn: 'root' })
export class ChatSearchApiService {
  private readonly baseUrl = '/api/search/chats';

  constructor(private readonly http: HttpClient) {}

  searchChats(query: SearchChatsQuery): Observable<SearchChatResultDto[]> {
    let params = new HttpParams().set('term', query.term);

    if (query.limit != null) params = params.set('limit', String(query.limit));
    if (query.includeSnippets != null)
      params = params.set('includeSnippets', String(query.includeSnippets));
    if (query.includeDeleted != null)
      params = params.set('includeDeleted', String(query.includeDeleted));

    return this.http.get<SearchChatResultDto[]>(this.baseUrl, { params });
  }
}
