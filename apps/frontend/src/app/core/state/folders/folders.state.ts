import { Injectable } from '@angular/core';
import { Action, createSelector, Selector, State } from '@ngxs/store';
import { catchError, tap } from 'rxjs/operators';
import { of } from 'rxjs';
import { FoldersApi } from '../../api/folders.api';
import type { ChatFolder } from '@shared/contracts';
import {
  CreateFolder,
  DeleteFolder,
  FoldersChangedSse,
  LoadFolders,
  RenameFolder,
} from './folders.actions';
import type { FoldersStateModel } from './folders.model';
import type { StateContext } from '@ngxs/store';
import { ReloadChats } from '../chats/chats.actions';

@State<FoldersStateModel>({
  name: 'folders',
  defaults: {
    items: [],
    isLoading: false,
    error: null,
    lastRefreshAt: null,
  },
})
@Injectable()
export class FoldersState {
  constructor(private readonly api: FoldersApi) {}

  @Selector()
  static items(s: FoldersStateModel) {
    return s.items;
  }

  @Selector()
  static isLoading(s: FoldersStateModel) {
    return s.isLoading;
  }

  static byId(folderId: string) {
    return createSelector(
      [FoldersState.items],
      (items: ChatFolder[]) => items.find((f) => f.id === folderId) ?? null,
    );
  }

  @Action(LoadFolders)
  load(ctx: StateContext<FoldersStateModel>) {
    ctx.patchState({ isLoading: true, error: null });

    return this.api.list().pipe(
      tap((items) => ctx.patchState({ items, isLoading: false, lastRefreshAt: Date.now() })),
      catchError((err) => {
        ctx.patchState({ isLoading: false, error: this.toErrorMessage(err) });
        return of([]);
      }),
    );
  }

  @Action(CreateFolder)
  create(ctx: StateContext<FoldersStateModel>, a: CreateFolder) {
    ctx.patchState({ error: null });
    return this.api.create(a.dto).pipe(
      tap((created) => {
        const s = ctx.getState();
        ctx.patchState({ items: [created, ...s.items] });
      }),
      catchError((err) => {
        ctx.patchState({ error: this.toErrorMessage(err) });
        return of(null);
      }),
    );
  }

  @Action(RenameFolder)
  rename(ctx: StateContext<FoldersStateModel>, a: RenameFolder) {
    ctx.patchState({ error: null });
    return this.api.update(a.id, a.dto).pipe(
      tap((updated) => {
        const s = ctx.getState();
        ctx.patchState({
          items: s.items.map((x) => (x.id === updated.id ? updated : x)),
        });
      }),
      catchError((err) => {
        ctx.patchState({ error: this.toErrorMessage(err) });
        return of(null);
      }),
    );
  }

  @Action(DeleteFolder)
  delete(ctx: StateContext<FoldersStateModel>, a: DeleteFolder) {
    ctx.patchState({ error: null });
    return this.api.delete(a.id).pipe(
      tap(() => {
        const s = ctx.getState();
        ctx.patchState({ items: s.items.filter((x) => x.id !== a.id) });
        ctx.dispatch(new ReloadChats());
      }),
      catchError((err) => {
        ctx.patchState({ error: this.toErrorMessage(err) });
        return of(null);
      }),
    );
  }

  /**
   * On SSE signal we refresh, but we throttle to avoid refresh storms.
   */
  @Action(FoldersChangedSse)
  foldersChanged(ctx: StateContext<FoldersStateModel>) {
    const s = ctx.getState();
    const now = Date.now();
    const last = s.lastRefreshAt ?? 0;

    // simple throttle: max 1 refresh per 500ms
    if (now - last < 500) return;

    return ctx.dispatch(new LoadFolders());
  }

  private toErrorMessage(err: any): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    return err?.error?.message ?? err?.message ?? 'Unknown error';
  }
}
