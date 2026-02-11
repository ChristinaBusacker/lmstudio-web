export type SearchMatchType = 'title' | 'user_message' | 'assistant_message';

export interface SearchChatMatch {
  type: SearchMatchType;
  snippet: string | null;
}

export interface SearchChatResult {
  chatId: string;
  title: string | null;
  folderId: string | null;
  updatedAt: string;
  score: number;
  matches: SearchChatMatch[];
}

export interface SearchChatsQuery {
  term: string;
  limit?: number;
  includeSnippets?: boolean;
  includeDeleted?: boolean;
}
