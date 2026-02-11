import type { ChatListItem, ListChatsQuery } from '@shared/contracts';

export interface ChatsStateModel {
  items: ChatListItem[];
  loading: boolean;

  // last query for reload / SSE reactions
  lastQuery: ListChatsQuery;

  lastSyncAt: string | null;
}
