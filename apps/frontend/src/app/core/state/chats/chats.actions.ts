import type { CreateChatDto } from '../../api/chats.api';

export class LoadChats {
  static readonly type = '[Chats] Load Chats';
  constructor(
    public readonly params?: {
      limit?: number;
      cursor?: string;
      folderId?: string | null;
      includeDeleted?: boolean;
    },
  ) {}
}

export class ReloadChats {
  static readonly type = '[Chats] Reload Chats';
}

export class SidebarChanged {
  static readonly type = '[Chats] Sidebar Changed (SSE)';
}

export class CreateChat {
  static readonly type = '[Chats] Create Chat';
  constructor(public readonly dto: CreateChatDto = {}) {}
}

export class RenameChat {
  static readonly type = '[Chats] Rename Chat';
  constructor(
    public readonly chatId: string,
    public readonly title: string,
  ) {}
}

export class MoveChat {
  static readonly type = '[Chats] Move Chat';
  constructor(
    public readonly chatId: string,
    public readonly folderId: string | null,
  ) {}
}

export class DeleteChat {
  static readonly type = '[Chats] Delete Chat';
  constructor(public readonly chatId: string) {}
}
