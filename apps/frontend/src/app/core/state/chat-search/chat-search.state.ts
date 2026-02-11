/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, OnDestroy } from '@angular/core';
import {
  Action,
  Actions,
  ofActionDispatched,
  Selector,
  State,
  StateContext,
  Store,
} from '@ngxs/store';
import { catchError, filter, map, of, Subscription, tap } from 'rxjs';

import { ChatSearchApiService } from '../../api/search.api';
import type { SearchChatResult } from '@shared/contracts';
import { ClearSearchResults, ExecuteSearch, SearchTermChanged } from './chat-search.actions';

export interface ChatSearchStateModel {
  term: string;
  limit: number;
  includeSnippets: boolean;
  includeDeleted: boolean;

  loading: boolean;
  error: string | null;
  results: SearchChatResult[];

  // Helpful to avoid repeated requests for same inputs
  lastExecutedKey: string | null;
}

@State<ChatSearchStateModel>({
  name: 'chatSearch',
  defaults: {
    term: '',
    limit: 20,
    includeSnippets: false,
    includeDeleted: false,

    loading: false,
    error: null,
    results: [],

    lastExecutedKey: null,
  },
})
@Injectable()
export class ChatSearchState implements OnDestroy {
  private readonly sub: Subscription;

  constructor(
    private readonly actions$: Actions,
    private readonly store: Store,
    private readonly api: ChatSearchApiService,
  ) {
    // Debounced search pipeline:
    // - listens to SearchTermChanged
    // - waits 2s after user stops typing
    // - dispatches ExecuteSearch
    this.sub = this.actions$
      .pipe(
        ofActionDispatched(SearchTermChanged),
        map(() => this.store.selectSnapshot(ChatSearchState.snapshotKeyAndTerm)),
        tap(({ term }) => {
          if (!term || !term.trim()) this.store.dispatch(new ClearSearchResults());
        }),
        filter(({ term }) => {
          if (!term || !term.trim()) return false;
          return true;
        }),
        map(({ key }) => key),
        tap(() => this.store.dispatch(new ExecuteSearch())),
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  // ---------- Selectors ----------

  @Selector()
  static term(state: ChatSearchStateModel): string {
    return state.term;
  }

  @Selector()
  static loading(state: ChatSearchStateModel): boolean {
    return state.loading;
  }

  @Selector()
  static error(state: ChatSearchStateModel): string | null {
    return state.error;
  }

  @Selector()
  static results(state: ChatSearchStateModel): SearchChatResult[] {
    return state.results;
  }

  // Internal helper selector for stable comparison keys
  static snapshotKeyAndTerm(state: ChatSearchStateModel): { key: string; term: string } {
    const key = JSON.stringify({
      term: state.term,
      limit: state.limit,
      includeSnippets: state.includeSnippets,
      includeDeleted: state.includeDeleted,
    });
    return { key, term: state.term };
  }

  // ---------- Actions ----------

  @Action(SearchTermChanged)
  termChanged(ctx: StateContext<ChatSearchStateModel>, action: SearchTermChanged): void {
    const state = ctx.getState();

    ctx.patchState({
      term: action.term ?? '',
      limit: action.options?.limit ?? state.limit,
      includeSnippets: action.options?.includeSnippets ?? state.includeSnippets,
      includeDeleted: action.options?.includeDeleted ?? state.includeDeleted,
      error: null,
      // Do not set loading here; we set it when ExecuteSearch runs.
    });
  }

  @Action(ClearSearchResults)
  clear(ctx: StateContext<ChatSearchStateModel>): void {
    ctx.patchState({
      loading: false,
      error: null,
      results: [],
      lastExecutedKey: null,
    });
  }

  @Action(ExecuteSearch)
  execute(ctx: StateContext<ChatSearchStateModel>) {
    const state = ctx.getState();
    const term = state.term.trim();

    if (!term) {
      ctx.dispatch(new ClearSearchResults());
      return;
    }

    const key = JSON.stringify({
      term,
      limit: state.limit,
      includeSnippets: state.includeSnippets,
      includeDeleted: state.includeDeleted,
    });

    // Skip request if nothing changed since last execution
    if (state.lastExecutedKey === key) return;

    ctx.patchState({ loading: true, error: null });

    return this.api
      .searchChats({
        term,
        limit: state.limit,
        includeSnippets: state.includeSnippets,
        includeDeleted: state.includeDeleted,
      })
      .pipe(
        tap((results) => {
          ctx.patchState({
            results,
            loading: false,
            error: null,
            lastExecutedKey: key,
          });
        }),
        catchError((err) => {
          // Keep error handling simple & UI-friendly
          const msg = err?.error?.message || err?.message || 'Search request failed';

          ctx.patchState({
            loading: false,
            error: String(msg),
          });

          return of([]);
        }),
      );
  }
}
