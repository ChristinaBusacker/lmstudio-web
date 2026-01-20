import type { ChatFolderDto } from '../../api/folders.api';

export interface FoldersStateModel {
  items: ChatFolderDto[];
  isLoading: boolean;
  error: string | null;
  /** Used to debounce refreshes triggered by SSE "folders.changed" */
  lastRefreshAt: number | null;
}
