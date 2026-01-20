import { Injectable } from '@angular/core';
import { Action, Selector, State } from '@ngxs/store';
import { catchError, of, tap } from 'rxjs';
import { ChatThreadApi, type ThreadMessageDto } from '../../api/chat-thread.api';
import { ChatRunsApi } from '../../api/chat-runs.api';
import {
  ActivateHead,
  ApplyRunStatusFromSse,
  ApplyVariantSnapshotFromSse,
  CloseChat,
  EnqueuedRunLocal,
  LoadThread,
  OpenChat,
  RegenerateAssistantMessage,
  SendMessage,
} from './chat-detail.actions';
import type { ChatDetailStateModel } from './chat-detail.model';
import type { StateContext } from '@ngxs/store';

@State<ChatDetailStateModel>({
  name: 'chatDetail',
  defaults: {
    chatId: null,
    loading: false,
    includeReasoning: false,
    meta: null,
    messages: [],
    messageById: {},
    runs: {},
    lastSyncAt: null,
    error: null,
  },
})
@Injectable()
export class ChatDetailState {
  constructor(
    private readonly threadApi: ChatThreadApi,
    private readonly runsApi: ChatRunsApi,
  ) {}

  // ---------- Selectors ----------

  @Selector()
  static chatId(s: ChatDetailStateModel): string | null {
    return s.chatId;
  }

  @Selector()
  static loading(s: ChatDetailStateModel): boolean {
    return s.loading;
  }

  @Selector()
  static meta(s: ChatDetailStateModel) {
    return s.meta;
  }

  @Selector()
  static messages(s: ChatDetailStateModel): ThreadMessageDto[] {
    return s.messages;
  }

  static messageById(id: string) {
    return (s: ChatDetailStateModel) => s.messageById[id] ?? null;
  }

  @Selector()
  static runs(s: ChatDetailStateModel) {
    return s.runs;
  }

  // ---------- Actions ----------

  @Action(OpenChat)
  openChat(ctx: StateContext<ChatDetailStateModel>, action: OpenChat) {
    // reset state for new chat
    ctx.patchState({
      chatId: action.chatId,
      loading: false,
      meta: null,
      messages: [],
      messageById: {},
      runs: {},
      error: null,
    });

    return ctx.dispatch(new LoadThread(action.chatId));
  }

  @Action(CloseChat)
  closeChat(ctx: StateContext<ChatDetailStateModel>) {
    ctx.setState({
      chatId: null,
      loading: false,
      includeReasoning: false,
      meta: null,
      messages: [],
      messageById: {},
      runs: {},
      lastSyncAt: null,
      error: null,
    });
  }

  @Action(LoadThread)
  loadThread(ctx: StateContext<ChatDetailStateModel>, action: LoadThread) {
    ctx.patchState({ loading: true, error: null });

    return this.threadApi.getThread(action.chatId, action.opts).pipe(
      tap((res) => {
        const { messages, messageById } = this.indexMessages(res.messages);

        ctx.patchState({
          chatId: res.chatId,
          meta: {
            title: res.title ?? null,
            folderId: res.folderId ?? null,
            activeHeadMessageId: res.activeHeadMessageId ?? null,
          },
          messages,
          messageById,
          loading: false,
          lastSyncAt: new Date().toISOString(),
        });
      }),
      catchError((err) => {
        console.error('[ChatDetail] loadThread failed', err);
        ctx.patchState({ loading: false, error: 'Failed to load thread' });
        return of(null);
      }),
    );
  }

  @Action(SendMessage)
  sendMessage(ctx: StateContext<ChatDetailStateModel>, action: SendMessage) {
    // V1: we rely on SSE + eventual REST refresh if needed.
    return this.runsApi.send(action.chatId, action.payload).pipe(
      tap((res) => {
        ctx.dispatch(new EnqueuedRunLocal(res));
      }),
      catchError((err) => {
        console.error('[ChatDetail] sendMessage failed', err);
        return of(null);
      }),
    );
  }

  @Action(RegenerateAssistantMessage)
  regenerate(ctx: StateContext<ChatDetailStateModel>, action: RegenerateAssistantMessage) {
    return this.runsApi.regenerate(action.messageId, action.payload).pipe(
      tap((res) => ctx.dispatch(new EnqueuedRunLocal(res))),
      catchError((err) => {
        console.error('[ChatDetail] regenerate failed', err);
        return of(null);
      }),
    );
  }

  @Action(ActivateHead)
  activateHead(ctx: StateContext<ChatDetailStateModel>, action: ActivateHead) {
    return this.runsApi.activateHead(action.chatId, { messageId: action.messageId }).pipe(
      tap((res) => {
        const s = ctx.getState();
        if (s.chatId !== action.chatId) return;
        ctx.patchState({
          meta: s.meta
            ? { ...s.meta, activeHeadMessageId: res.activeHeadMessageId }
            : { title: null, folderId: null, activeHeadMessageId: res.activeHeadMessageId },
        });
        // Head changed => thread content changed
        ctx.dispatch(new LoadThread(action.chatId));
      }),
      catchError((err) => {
        console.error('[ChatDetail] activateHead failed', err);
        return of(null);
      }),
    );
  }

  @Action(ApplyVariantSnapshotFromSse)
  applyVariantSnapshot(
    ctx: StateContext<ChatDetailStateModel>,
    action: ApplyVariantSnapshotFromSse,
  ) {
    const s = ctx.getState();
    if (!s.chatId || s.chatId !== action.payload.chatId) return;

    const msg = s.messageById[action.payload.messageId];
    if (!msg) {
      // Could happen if UI joined late. For V1: do a resync.
      ctx.dispatch(new LoadThread(action.payload.chatId));
      return;
    }

    const patched: ThreadMessageDto = {
      ...msg,
      activeVariant: {
        ...msg.activeVariant,
        content: action.payload.content,
        reasoning: action.payload.reasoning,
      },
    };

    ctx.patchState(this.patchMessage(s, patched));
  }

  @Action(ApplyRunStatusFromSse)
  applyRunStatus(ctx: StateContext<ChatDetailStateModel>, action: ApplyRunStatusFromSse) {
    const s = ctx.getState();
    if (!s.chatId || s.chatId !== action.payload.chatId) return;

    const now = new Date().toISOString();
    ctx.patchState({
      runs: {
        ...s.runs,
        [action.payload.runId]: {
          runId: action.payload.runId,
          status: action.payload.status,
          stats: action.payload.stats ?? null,
          error: action.payload.error ?? null,
          updatedAt: now,
        },
      },
    });

    // When a run completes/fails/cancels, safest V1 move is: refresh thread once.
    if (
      action.payload.status === 'completed' ||
      action.payload.status === 'failed' ||
      action.payload.status === 'canceled'
    ) {
      ctx.dispatch(new LoadThread(action.payload.chatId));
    }
  }

  @Action(EnqueuedRunLocal)
  enqueued(ctx: StateContext<ChatDetailStateModel>, action: EnqueuedRunLocal) {
    const s = ctx.getState();
    if (!s.chatId || s.chatId !== action.res.chatId) return;

    // show immediate queued state in UI even before SSE arrives
    const now = new Date().toISOString();
    ctx.patchState({
      runs: {
        ...s.runs,
        [action.res.runId]: {
          runId: action.res.runId,
          status: action.res.status,
          updatedAt: now,
        },
      },
    });
  }

  private indexMessages(messages: ThreadMessageDto[]) {
    const messageById: Record<string, ThreadMessageDto> = {};
    for (const m of messages) messageById[m.id] = m;
    return { messages, messageById };
  }

  private patchMessage(state: ChatDetailStateModel, patched: ThreadMessageDto) {
    const nextById = { ...state.messageById, [patched.id]: patched };
    const nextArr = state.messages.map((m) => (m.id === patched.id ? patched : m));
    return { messageById: nextById, messages: nextArr };
  }
}
