import type { CreateChatFolderDto, UpdateChatFolderDto } from '../../api/folders.api';

export class LoadFolders {
  static readonly type = '[Folders] Load';
}

export class CreateFolder {
  static readonly type = '[Folders] Create';
  constructor(public readonly dto: CreateChatFolderDto) {}
}

export class RenameFolder {
  static readonly type = '[Folders] Rename';
  constructor(
    public readonly id: string,
    public readonly dto: UpdateChatFolderDto,
  ) {}
}

export class DeleteFolder {
  static readonly type = '[Folders] Delete';
  constructor(public readonly id: string) {}
}

/** SSE event marker → triggers a refresh (debounced in state) */
export class FoldersChangedSse {
  static readonly type = '[Folders] SSE Changed';
}
