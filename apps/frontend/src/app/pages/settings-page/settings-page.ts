// Comments in English as requested.

import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngxs/store';
import { Observable, Subject, takeUntil } from 'rxjs';

import { SettingsState } from '../../core/state/settings/settings.state';
import {
  LoadProfiles,
  ClearError,
  LoadProfileById,
  CreateProfile,
  SetDefaultProfile,
  UpdateProfile,
  DeleteProfile,
} from '../../core/state/settings/settings.actions';

import { ModelsState } from '../../core/state/models/models.state';
import {
  LoadModels,
  LoadLoadedModels,
  LoadModel,
  UnloadModel,
} from '../../core/state/models/models.actions';

import type {
  SettingsProfile,
  CreateSettingsProfilePayload,
  UpdateSettingsProfilePayload,
} from '../../core/api/settings.api';
import type { ModelListItemDto } from '../../core/api/models.api';
import { ProfilesSidebar } from './components/profiles-sidebar/profiles-sidebar';
import { UserPreferences } from './components/user-preferences/user-preferences';
import { ProfileEditor } from './components/profile-editor/profile-editor';
import { ModelsPanel } from './components/models-panel/models-panel';

type SettingsTab = 'profiles' | 'models' | 'user';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, ProfilesSidebar, ProfileEditor, UserPreferences, ModelsPanel],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  tab: SettingsTab = 'profiles';

  // Store streams (settings)
  profiles$!: Observable<SettingsProfile[]>;
  selected$!: Observable<SettingsProfile | null>;
  default$!: Observable<SettingsProfile | null>;
  loading$!: Observable<boolean>;
  error$!: Observable<string | null>;

  // Store streams (models)
  models$!: Observable<ModelListItemDto[]>;
  modelsLoading$!: Observable<boolean>;

  selectedId: string | null = null;

  constructor(private readonly store: Store) {}

  ngOnInit(): void {
    this.profiles$ = this.store.select(SettingsState.profiles);
    this.selected$ = this.store.select(SettingsState.selectedProfile);
    this.default$ = this.store.select(SettingsState.defaultProfile);
    this.loading$ = this.store.select(SettingsState.isLoading);
    this.error$ = this.store.select(SettingsState.error);

    this.models$ = this.store.select(ModelsState.allSorted);
    this.modelsLoading$ = this.store.select(ModelsState.loading);

    this.reload();
    this.store.dispatch([new LoadModels(), new LoadLoadedModels()]);

    // Keep selectedId in sync so sidebar can highlight it.
    this.selected$.pipe(takeUntil(this.destroy$)).subscribe((p) => {
      this.selectedId = p?.id ?? null;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // -----------------------
  // Page actions (settings)
  // -----------------------

  setTab(tab: SettingsTab): void {
    this.tab = tab;
  }

  reload(): void {
    this.store.dispatch(new LoadProfiles());
  }

  reloadModels(): void {
    this.store.dispatch([new LoadModels(), new LoadLoadedModels()]);
  }

  clearError(): void {
    this.store.dispatch(new ClearError());
  }

  selectProfile(profileId: string): void {
    this.selectedId = profileId;
    this.store.dispatch(new LoadProfileById(profileId));
  }

  createProfile(payload: CreateSettingsProfilePayload): void {
    this.store.dispatch(new CreateProfile(payload));
  }

  setDefault(profileId: string): void {
    this.store.dispatch(new SetDefaultProfile(profileId));
  }

  saveProfile(profileId: string, patch: UpdateSettingsProfilePayload): void {
    this.store.dispatch(new UpdateProfile(profileId, patch));
  }

  deleteProfile(profileId: string): void {
    if (window.confirm('Are you sure to delete this profile?')) {
      this.store.dispatch(new DeleteProfile(profileId));
    }
  }

  // -----------------------
  // Page actions (models)
  // -----------------------

  loadModel(modelId: string): void {
    this.store.dispatch(new LoadModel(modelId, {} as any));
  }

  unloadModel(modelId: string): void {
    this.store.dispatch(new UnloadModel(modelId, {} as any));
  }

  isModelBusy(id: string) {
    return this.store.select(ModelsState.isBusy(id));
  }

  isModelLoaded(id: string) {
    return this.store.select(ModelsState.isLoaded(id));
  }
}
