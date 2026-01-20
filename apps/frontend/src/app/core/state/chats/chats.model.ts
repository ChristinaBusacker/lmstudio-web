import type { ChatListItemDto } from '../../api/chats.api';

export interface ChatsStateModel {
  items: ChatListItemDto[];
  loading: boolean;

  // last query for reload / SSE reactions
  lastQuery: {
    limit: number;
    cursor?: string;
    folderId?: string | null;
    includeDeleted: boolean;
  };

  lastSyncAt: string | null;
}
