export type SortDirection = 'asc' | 'desc';

export interface Sort {
  field: string;
  direction: SortDirection;
}

export interface PageRequest {
  /** 0-based page index. */
  page: number;
  /** Page size. */
  size: number;
  /** Optional sort order. */
  sort?: Sort[];
}

export interface PageInfo {
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export interface PagedResponse<T> {
  items: T[];
  page: PageInfo;
}
