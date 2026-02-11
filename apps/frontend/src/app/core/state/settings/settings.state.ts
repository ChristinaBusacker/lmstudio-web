// Comments in English as requested.

import { Injectable } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { tap, catchError } from 'rxjs/operators';
import { EMPTY } from 'rxjs';
import { SettingsApiService } from '../../api/settings.api';
import type { SettingsProfile } from '@shared/contracts';
import {
  ClearError,
  CreateProfile,
  DeleteProfile,
  LoadProfileById,
  LoadProfiles,
  SetDefaultProfile,
  UpdateProfile,
} from './settings.actions';

export interface SettingsStateModel {
  profiles: SettingsProfile[];
  selectedProfileId: string | null;
  isLoading: boolean;
  error: string | null;
}

@State<SettingsStateModel>({
  name: 'settings',
  defaults: {
    profiles: [],
    selectedProfileId: null,
    isLoading: false,
    error: null,
  },
})
@Injectable()
export class SettingsState {
  constructor(private readonly api: SettingsApiService) {}

  // ----------------------------
  // Selectors
  // ----------------------------

  @Selector()
  static profiles(state: SettingsStateModel): SettingsProfile[] {
    return state.profiles;
  }

  @Selector()
  static isLoading(state: SettingsStateModel): boolean {
    return state.isLoading;
  }

  @Selector()
  static error(state: SettingsStateModel): string | null {
    return state.error;
  }

  @Selector()
  static selectedProfileId(state: SettingsStateModel): string | null {
    return state.selectedProfileId;
  }

  @Selector()
  static selectedProfile(state: SettingsStateModel): SettingsProfile | null {
    const id = state.selectedProfileId;
    if (!id) return null;
    return state.profiles.find((p) => p.id === id) ?? null;
  }

  @Selector()
  static defaultProfile(state: SettingsStateModel): SettingsProfile | null {
    return state.profiles.find((p) => p.isDefault) ?? null;
  }

  // ----------------------------
  // Actions
  // ----------------------------

  @Action(ClearError)
  clearError(ctx: StateContext<SettingsStateModel>) {
    ctx.patchState({ error: null });
  }

  @Action(LoadProfiles)
  loadProfiles(ctx: StateContext<SettingsStateModel>) {
    ctx.patchState({ isLoading: true, error: null });

    return this.api.listProfiles().pipe(
      tap((profiles) => {
        ctx.patchState({ profiles, isLoading: false });

        // Keep selection stable if possible.
        const selectedId = ctx.getState().selectedProfileId;
        if (selectedId && !profiles.some((p) => p.id === selectedId)) {
          ctx.patchState({ selectedProfileId: null });
        }
      }),
      catchError((err) => {
        ctx.patchState({
          isLoading: false,
          error: this.toErrMsg(err, 'Failed to load profiles'),
        });
        return EMPTY;
      }),
    );
  }

  @Action(LoadProfileById)
  loadProfileById(ctx: StateContext<SettingsStateModel>, action: LoadProfileById) {
    ctx.patchState({ isLoading: true, error: null });

    return this.api.getProfile(action.id).pipe(
      tap((profile) => {
        const state = ctx.getState();
        const next = upsertById(state.profiles, profile);
        ctx.patchState({
          profiles: next,
          selectedProfileId: profile.id,
          isLoading: false,
        });
      }),
      catchError((err) => {
        ctx.patchState({
          isLoading: false,
          error: this.toErrMsg(err, 'Failed to load profile'),
        });
        return EMPTY;
      }),
    );
  }

  @Action(DeleteProfile)
  deleteProfile(ctx: StateContext<SettingsStateModel>, action: LoadProfileById) {
    ctx.patchState({ isLoading: true, error: null });

    return this.api.deleteProfile(action.id).pipe(
      tap((profiles) => {
        ctx.patchState({ profiles, isLoading: false });

        const selectedId = ctx.getState().selectedProfileId;
        if (selectedId && !profiles.some((p) => p.id === selectedId)) {
          ctx.patchState({ selectedProfileId: null });
        }
      }),
      catchError((err) => {
        ctx.patchState({
          isLoading: false,
          error: this.toErrMsg(err, 'Failed to load profiles'),
        });
        return EMPTY;
      }),
    );
  }

  @Action(CreateProfile)
  createProfile(ctx: StateContext<SettingsStateModel>, action: CreateProfile) {
    ctx.patchState({ isLoading: true, error: null });

    return this.api.createProfile(action.payload).pipe(
      tap((created) => {
        const state = ctx.getState();
        let profiles = [...state.profiles, created];

        // If created is default, ensure only one default in store.
        if (created.isDefault) {
          profiles = profiles.map((p) => (p.id === created.id ? p : { ...p, isDefault: false }));
        }

        ctx.patchState({
          profiles,
          selectedProfileId: created.id,
          isLoading: false,
        });
      }),
      catchError((err) => {
        ctx.patchState({
          isLoading: false,
          error: this.toErrMsg(err, 'Failed to create profile'),
        });
        return EMPTY;
      }),
    );
  }

  @Action(UpdateProfile)
  updateProfile(ctx: StateContext<SettingsStateModel>, action: UpdateProfile) {
    ctx.patchState({ isLoading: true, error: null });

    return this.api.updateProfile(action.id, action.patch).pipe(
      tap((updated) => {
        const state = ctx.getState();
        let profiles = upsertById(state.profiles, updated);

        // If it became default, clear default on others.
        if (updated.isDefault) {
          profiles = profiles.map((p) => (p.id === updated.id ? p : { ...p, isDefault: false }));
        }

        ctx.patchState({ profiles, isLoading: false });
      }),
      catchError((err) => {
        ctx.patchState({
          isLoading: false,
          error: this.toErrMsg(err, 'Failed to update profile'),
        });
        return EMPTY;
      }),
    );
  }

  @Action(SetDefaultProfile)
  setDefaultProfile(ctx: StateContext<SettingsStateModel>, action: SetDefaultProfile) {
    ctx.patchState({ isLoading: true, error: null });

    return this.api.setDefaultProfile(action.id).pipe(
      tap((serverReturnedDefaultProfile) => {
        // Your API returns the profile after being set default.
        const state = ctx.getState();

        // Ensure only one default in store.
        const profiles = state.profiles.map((p) => {
          if (p.id === serverReturnedDefaultProfile.id) return serverReturnedDefaultProfile;
          if (p.isDefault) return { ...p, isDefault: false };
          return p;
        });

        ctx.patchState({ profiles, isLoading: false });
      }),
      catchError((err) => {
        ctx.patchState({
          isLoading: false,
          error: this.toErrMsg(err, 'Failed to set default profile'),
        });
        return EMPTY;
      }),
    );
  }

  // ----------------------------
  // Helpers
  // ----------------------------

  private toErrMsg(err: any, fallback: string): string {
    const msg =
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      err?.error?.message ?? err?.message ?? (typeof err === 'string' ? err : null) ?? fallback;
    return String(msg);
  }
}

function upsertById(list: SettingsProfile[], item: SettingsProfile): SettingsProfile[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const next = list.slice();
  next[idx] = item;
  return next;
}
