// src/app/core/state/runs/runs.state.ts
import { Injectable, inject } from '@angular/core';
import { Action, Selector, State } from '@ngxs/store';
import { catchError, tap } from 'rxjs/operators';
import { of } from 'rxjs';

import type { RunStatusDto, RunsStateModel, RunStatus } from './runs.model';

import {
  CancelRun,
  LoadActiveRuns,
  LoadChatRuns,
  PatchRunFromSse,
  UpsertRunFromSse,
} from './runs.actions';
import { RunsApiService } from '../../api/runs.api';

import type { StateContext } from '@ngxs/store';

function isActive(status: RunStatus): boolean {
  return status === 'queued' || status === 'running';
}

function dedupeKeepOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function sortRunsForUi(a: RunStatusDto, b: RunStatusDto): number {
  // queued first, then running, then rest; newest first within each bucket
  const rank = (s: RunStatus) => (s === 'queued' ? 0 : s === 'running' ? 1 : 2);
  const r = rank(a.status) - rank(b.status);
  if (r !== 0) return r;
  // createdAt desc
  return b.createdAt.localeCompare(a.createdAt);
}

@State<RunsStateModel>({
  name: 'runs',
  defaults: {
    entities: {},
    order: [],
    activeIds: [],
    loadedActive: false,
    loadingActive: false,
    error: null,
  },
})
@Injectable()
export class RunsState {
  private readonly api = inject(RunsApiService);

  // ---------- Selectors ----------

  @Selector()
  static entities(s: RunsStateModel) {
    return s.entities;
  }

  @Selector()
  static all(s: RunsStateModel): RunStatusDto[] {
    return s.order.map((id) => s.entities[id]).filter(Boolean);
  }

  @Selector()
  static active(s: RunsStateModel): RunStatusDto[] {
    return s.activeIds.map((id) => s.entities[id]).filter(Boolean);
  }

  @Selector()
  static queuedCount(s: RunsStateModel): number {
    let n = 0;
    for (const id of s.activeIds) if (s.entities[id]?.status === 'queued') n++;
    return n;
  }

  @Selector()
  static runningCount(s: RunsStateModel): number {
    let n = 0;
    for (const id of s.activeIds) if (s.entities[id]?.status === 'running') n++;
    return n;
  }

  /**
   * Selector factory: active runs for a chat (queue view per chat)
   */
  static activeByChat(chatId: string) {
    return (s: RunsStateModel): RunStatusDto[] =>
      s.activeIds
        .map((id) => s.entities[id])
        .filter((r): r is RunStatusDto => !!r && r.chatId === chatId)
        .sort(sortRunsForUi);
  }

  // ---------- Actions ----------

  @Action(LoadActiveRuns)
  loadActiveRuns(ctx: StateContext<RunsStateModel>, action: LoadActiveRuns) {
    ctx.patchState({ loadingActive: true, error: null });

    return this.api.listActive(action.queueKey, action.limit).pipe(
      tap((runs) => {
        const state = ctx.getState();

        const nextEntities = { ...state.entities };
        for (const r of runs) nextEntities[r.id] = r;

        const sorted = [...runs].sort(sortRunsForUi).map((r) => r.id);
        const activeIds = sorted.filter((id) => isActive(nextEntities[id].status));

        ctx.patchState({
          entities: nextEntities,
          order: dedupeKeepOrder([...sorted, ...state.order]),
          activeIds,
          loadedActive: true,
          loadingActive: false,
          error: null,
        });
      }),
      catchError((err: unknown) => {
        ctx.patchState({
          loadingActive: false,
          error: err instanceof Error ? err.message : 'Failed to load active runs',
        });
        return of(null);
      }),
    );
  }

  @Action(LoadChatRuns)
  loadChatRuns(ctx: StateContext<RunsStateModel>, action: LoadChatRuns) {
    return this.api.listByChat(action.chatId, action.limit).pipe(
      tap((runs) => {
        const state = ctx.getState();

        const nextEntities = { ...state.entities };
        for (const r of runs) nextEntities[r.id] = r;

        // keep a global order list that remains useful
        const sorted = [...runs].sort(sortRunsForUi).map((r) => r.id);

        // activeIds is global; update it based on entities
        const nextActiveIds = dedupeKeepOrder([
          ...Object.keys(nextEntities).filter((id) => isActive(nextEntities[id].status)),
        ]).sort((a, b) => sortRunsForUi(nextEntities[a], nextEntities[b]));

        ctx.patchState({
          entities: nextEntities,
          order: dedupeKeepOrder([...sorted, ...state.order]),
          activeIds: nextActiveIds,
        });
      }),
    );
  }

  @Action(UpsertRunFromSse)
  upsertFromSse(ctx: StateContext<RunsStateModel>, action: UpsertRunFromSse) {
    const state = ctx.getState();
    const nextEntities = { ...state.entities, [action.run.id]: action.run };

    const nextOrder = dedupeKeepOrder([action.run.id, ...state.order]);
    const nextActiveIds = dedupeKeepOrder(
      Object.keys(nextEntities).filter((id) => isActive(nextEntities[id].status)),
    ).sort((a, b) => sortRunsForUi(nextEntities[a], nextEntities[b]));

    ctx.patchState({
      entities: nextEntities,
      order: nextOrder,
      activeIds: nextActiveIds,
    });
  }

  @Action(PatchRunFromSse)
  patchFromSse(ctx: StateContext<RunsStateModel>, action: PatchRunFromSse) {
    const state = ctx.getState();
    const existing = state.entities[action.runId];
    if (!existing) return;

    const merged: RunStatusDto = { ...existing, ...action.patch };
    return ctx.dispatch(new UpsertRunFromSse(merged));
  }

  @Action(CancelRun)
  cancelRun(ctx: StateContext<RunsStateModel>, action: CancelRun) {
    // optimistic UI: mark as canceled-ish if you want (optional)
    return this.api.cancel(action.runId).pipe(
      tap(() => {
        // real status comes via SSE or next refresh; optionally:
        // ctx.dispatch(new LoadActiveRuns());
      }),
    );
  }
}
