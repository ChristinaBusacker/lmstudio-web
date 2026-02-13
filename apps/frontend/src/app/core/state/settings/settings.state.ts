// Comments in English as requested.

import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { EMPTY, of, switchMap, tap, catchError } from 'rxjs';
import { SettingsApiService } from '../../api/settings.api';
import type { SettingsProfile } from '@shared/contracts';
import { DialogService } from '../../../ui/dialog/dialog.service';
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
  private readonly firstVisitKey = 'lmstudio-web:first-visit-settings-profile-hint-shown';

  constructor(
    private readonly api: SettingsApiService,
    private readonly dialogs: DialogService,
    private readonly router: Router,
  ) {}

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
      switchMap((profiles) => {
        // If there is exactly one profile and none is marked as default, auto-default it.
        if (profiles.length === 1 && !profiles[0]?.isDefault) {
          return this.api.setDefaultProfile(profiles[0].id).pipe(
            switchMap((serverDefault) => {
              const next = profiles.map((p) => (p.id === serverDefault.id ? serverDefault : p));
              return of(next);
            }),
          );
        }
        return of(profiles);
      }),
      tap((profiles) => {
        ctx.patchState({ profiles, isLoading: false });

        // Keep selection stable if possible.
        const selectedId = ctx.getState().selectedProfileId;
        if (selectedId && !profiles.some((p) => p.id === selectedId)) {
          ctx.patchState({ selectedProfileId: null });
        }

        // First-visit onboarding hint: when there are no profiles yet.
        this.maybeShowFirstVisitSettingsProfileHint(profiles);
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
      switchMap((created) => {
        const state = ctx.getState();
        const nextProfiles = [...state.profiles, created];

        // If this is the first (and only) profile, ensure it becomes default.
        if (nextProfiles.length === 1 && !created.isDefault) {
          return this.api
            .setDefaultProfile(created.id)
            .pipe(
              switchMap((serverDefault) => of({ created: serverDefault, isDefaultForced: true })),
            );
        }

        return of({ created, isDefaultForced: false });
      }),
      tap(({ created }) => {
        const state = ctx.getState();
        let profiles = upsertById(state.profiles, created);

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

  private maybeShowFirstVisitSettingsProfileHint(profiles: SettingsProfile[]): void {
    // Guard against SSR and non-browser environments.
    if (typeof window === 'undefined') return;
    if (typeof localStorage === 'undefined') return;

    // Only show this once per browser profile.
    const alreadyShown = localStorage.getItem(this.firstVisitKey) === '1';
    if (alreadyShown) return;

    // Only show the hint if there are no profiles yet.
    if (profiles.length > 0) return;

    localStorage.setItem(this.firstVisitKey, '1');

    const ref = this.dialogs.confirm({
      title: 'Welcome',
      message:
        'Before you can run workflows or chat, please create a Settings Profile first. It defines your model and runtime settings.',
      confirmLabel: 'Open settings',
      declineLabel: 'Later',
      closeLabel: null,
    });

    ref.afterClosed().subscribe((r) => {
      if (r.action === 'confirm') {
        void this.router.navigate(['/settings']);
      }
    });
  }
}

function upsertById(list: SettingsProfile[], item: SettingsProfile): SettingsProfile[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const next = list.slice();
  next[idx] = item;
  return next;
}
