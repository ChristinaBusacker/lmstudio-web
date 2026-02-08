import { Injectable } from '@angular/core';
import { Action, createSelector, Selector, State } from '@ngxs/store';
import { catchError, of, switchMap, tap } from 'rxjs';
import { ChatsApi, type ChatListItemDto } from '../../api/chats.api';
import {
  CreateChat,
  DeleteChat,
  LoadChats,
  MoveChat,
  ReloadChats,
  RenameChat,
  SidebarChanged,
} from './chats.actions';

import type { StateContext } from '@ngxs/store';
import { Router } from '@angular/router';
import { ChatsStateModel } from './chats.model';

@State<ChatsStateModel>({
  name: 'chats',
  defaults: {
    items: [],
    loading: false,
    lastQuery: {
      limit: 50,
      includeDeleted: false,
      folderId: undefined,
      cursor: undefined,
    },
    lastSyncAt: null,
  },
})
@Injectable()
export class ChatsState {
  constructor(
    private readonly api: ChatsApi,
    private readonly router: Router,
  ) {}

  // ---------- Selectors ----------

  @Selector()
  static loading(s: ChatsStateModel): boolean {
    return s.loading;
  }

  @Selector()
  static items(s: ChatsStateModel): ChatListItemDto[] {
    return s.items;
  }

  static byFolder(folderId: string | null | undefined) {
    return createSelector([ChatsState.items], (items: ChatListItemDto[]) =>
      items.filter((c) => c.folderId === folderId),
    );
  }

  static byId(chatId: string) {
    return createSelector(
      [ChatsState.items],
      (items: ChatListItemDto[]) => items.find((c) => c.id === chatId) ?? null,
    );
  }

  // ---------- Actions ----------

  @Action(LoadChats)
  load(ctx: StateContext<ChatsStateModel>, action: LoadChats) {
    const q = {
      limit: action.params?.limit ?? ctx.getState().lastQuery.limit ?? 50,
      cursor: action.params?.cursor ?? undefined,
      folderId: action.params?.folderId ?? ctx.getState().lastQuery.folderId ?? undefined,
      includeDeleted:
        action.params?.includeDeleted ?? ctx.getState().lastQuery.includeDeleted ?? false,
    };

    ctx.patchState({ loading: true, lastQuery: q });

    return this.api.list(q).pipe(
      tap((items) => {
        // Sort: newest updated first (sidebar UX)
        const sorted = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        ctx.patchState({
          items: sorted,
          loading: false,
          lastSyncAt: new Date().toISOString(),
        });
      }),
      catchError((err) => {
        console.error('[Chats] load failed', err);
        ctx.patchState({ loading: false });
        return of([]);
      }),
    );
  }

  @Action(ReloadChats)
  reload(ctx: StateContext<ChatsStateModel>) {
    return ctx.dispatch(new LoadChats(ctx.getState().lastQuery));
  }

  @Action(SidebarChanged)
  sidebarChanged(ctx: StateContext<ChatsStateModel>) {
    return ctx.dispatch(new ReloadChats());
  }

  @Action(CreateChat)
  create(ctx: StateContext<any>, action: CreateChat) {
    return this.api.create(action.dto).pipe(
      tap((created) => {
        void this.router.navigate(['/chat', created.id]);
      }),
      switchMap((created) => ctx.dispatch(new ReloadChats()).pipe(tap(() => created))),
      catchError((err) => {
        console.error('[Chats] create failed', err);
        return of(null);
      }),
    );
  }

  @Action(RenameChat)
  rename(ctx: StateContext<ChatsStateModel>, action: RenameChat) {
    return this.api.rename(action.chatId, { title: action.title }).pipe(
      tap(() => ctx.dispatch(new ReloadChats())),
      catchError((err) => {
        console.error('[Chats] rename failed', err);
        return of(null);
      }),
    );
  }

  @Action(MoveChat)
  move(ctx: StateContext<ChatsStateModel>, action: MoveChat) {
    return this.api.move(action.chatId, { folderId: action.folderId }).pipe(
      tap(() => ctx.dispatch(new ReloadChats())),
      catchError((err) => {
        console.error('[Chats] move failed', err);
        return of(null);
      }),
    );
  }

  @Action(DeleteChat)
  delete(ctx: StateContext<ChatsStateModel>, action: DeleteChat) {
    return this.api.softDelete(action.chatId).pipe(
      tap(() => ctx.dispatch(new ReloadChats())),
      catchError((err) => {
        console.error('[Chats] delete failed', err);
        return of(null);
      }),
    );
  }
}
