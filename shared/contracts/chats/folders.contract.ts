export interface CreateChatFolderRequest {
  name: string;
}

export interface UpdateChatFolderRequest {
  name?: string;
}

export interface ChatFolder {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface DeleteChatFolderResponse {
  folderId: string;
  deletedAt: string;
  affectedChats: number;
}
