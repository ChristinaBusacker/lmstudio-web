import { Injectable } from '@angular/core';
import { Action, createSelector, Selector, State } from '@ngxs/store';
import { catchError, forkJoin, of, tap } from 'rxjs';
import { ModelsApi } from '../../api/models.api';
import type { LmModelListItem, LoadedModelInstance, LoadModelResponse, UnloadModelResponse } from '@shared/contracts';
import {
  LoadLoadedModels,
  LoadModel,
  LoadModels,
  ModelsChanged,
  UnloadModel,
} from './models.actions';
import type { ModelsStateModel } from './models.model';
import type { StateContext } from '@ngxs/store';

@State<ModelsStateModel>({
  name: 'models',
  defaults: {
    models: {},
    loadedInstances: [],
    busy: {},
    lastSyncAt: null,
    loading: false,
  },
})
@Injectable()
export class ModelsState {
  constructor(private readonly api: ModelsApi) {}

  // ---------- Selectors ----------

  @Selector()
  static loading(s: ModelsStateModel): boolean {
    return s.loading;
  }

  @Selector()
  static all(s: ModelsStateModel): LmModelListItem[] {
    return Object.values(s.models);
  }

  @Selector()
  static allSorted(s: ModelsStateModel): LmModelListItem[] {
    const all = Object.values(s.models);
    return all.sort((a, b) => {
      // loaded first, then by id
      const aScore = a.state === 'loaded' ? 0 : a.state === 'not-loaded' ? 1 : 2;
      const bScore = b.state === 'loaded' ? 0 : b.state === 'not-loaded' ? 1 : 2;
      if (aScore !== bScore) return aScore - bScore;
      return a.id.localeCompare(b.id);
    });
  }

  @Selector()
  static loadedInstances(s: ModelsStateModel): LoadedModelInstance[] {
    return s.loadedInstances;
  }

  static isBusy(id: string) {
    return createSelector([ModelsState], (state: ModelsStateModel) => Boolean(state.busy[id]));
  }

  static byId(id: string) {
    return createSelector([ModelsState], (state: ModelsStateModel) => state.models[id] ?? null);
  }

  static isLoaded(id: string) {
    return createSelector(
      [ModelsState],
      (state: ModelsStateModel) => state.models[id]?.state === 'loaded',
    );
  }
  // ---------- Actions ----------

  @Action(LoadModels)
  loadModels(ctx: StateContext<ModelsStateModel>) {
    ctx.patchState({ loading: true });

    return this.api.list().pipe(
      tap((list) => {
        const next: Record<string, LmModelListItem> = {};
        for (const m of list) next[m.id] = m;

        ctx.patchState({
          models: next,
          lastSyncAt: new Date().toISOString(),
          loading: false,
        });
      }),
      catchError((err) => {
        console.error('[Models] loadModels failed', err);
        ctx.patchState({ loading: false });
        return of([]);
      }),
    );
  }

  @Action(LoadLoadedModels)
  loadLoadedModels(ctx: StateContext<ModelsStateModel>) {
    return this.api.loaded().pipe(
      tap((loadedInstances) => {
        ctx.patchState({ loadedInstances });
      }),
      catchError((err) => {
        console.error('[Models] loadLoadedModels failed', err);
        return of([]);
      }),
    );
  }

  @Action(LoadModel)
  loadModel(ctx: StateContext<ModelsStateModel>, action: LoadModel) {
    this.setBusy(ctx, action.id, true);

    return this.api.load(action.id, action.dto).pipe(
      tap(() => {
        // simplest V1: resync
        this.setBusy(ctx, action.id, false);
        ctx.dispatch([new LoadModels(), new LoadLoadedModels()]);
      }),
      catchError((err) => {
        console.error('[Models] loadModel failed', err);
        this.setBusy(ctx, action.id, false);
        return of(null);
      }),
    );
  }

  @Action(UnloadModel)
  unloadModel(ctx: StateContext<ModelsStateModel>, action: UnloadModel) {
    this.setBusy(ctx, action.id, true);

    return this.api.unload(action.id, action.dto).pipe(
      tap(() => {
        this.setBusy(ctx, action.id, false);
        ctx.dispatch([new LoadModels(), new LoadLoadedModels()]);
      }),
      catchError((err) => {
        console.error('[Models] unloadModel failed', err);
        this.setBusy(ctx, action.id, false);
        return of(null);
      }),
    );
  }

  @Action(ModelsChanged)
  modelsChanged(ctx: StateContext<ModelsStateModel>) {
    // V1: server says "something changed" => resync.
    // ForkJoin keeps this clean and deterministic.
    return forkJoin([this.api.list(), this.api.loaded()]).pipe(
      tap(([list, loaded]) => {
        const next: Record<string, LmModelListItem> = {};
        for (const m of list) next[m.id] = m;

        ctx.patchState({
          models: next,
          loadedInstances: loaded,
          lastSyncAt: new Date().toISOString(),
        });
      }),
      catchError((err) => {
        console.error('[Models] modelsChanged resync failed', err);
        return of(null);
      }),
    );
  }

  private setBusy(ctx: StateContext<ModelsStateModel>, id: string, busy: boolean) {
    const s = ctx.getState();
    ctx.patchState({
      busy: {
        ...s.busy,
        [id]: busy,
      },
    });
  }
}
