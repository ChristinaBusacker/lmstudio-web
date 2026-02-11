import type { ChatFolder } from '@shared/contracts';

export interface FoldersStateModel {
  items: ChatFolder[];
  isLoading: boolean;
  error: string | null;
  /** Used to debounce refreshes triggered by SSE "folders.changed" */
  lastRefreshAt: number | null;
}
