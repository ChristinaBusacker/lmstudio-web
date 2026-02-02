export class SearchTermChanged {
  static readonly type = '[ChatSearch] Term Changed';
  constructor(
    public readonly term: string,
    public readonly options?: Partial<{
      limit: number;
      includeSnippets: boolean;
      includeDeleted: boolean;
    }>,
  ) {}
}

export class ExecuteSearch {
  static readonly type = '[ChatSearch] Execute';
  constructor() {}
}

export class ClearSearchResults {
  static readonly type = '[ChatSearch] Clear Results';
  constructor() {}
}
