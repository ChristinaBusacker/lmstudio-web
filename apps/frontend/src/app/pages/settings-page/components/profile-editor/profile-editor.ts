import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModelListItemDto } from '@frontend/src/app/core/api/models.api';
import {
  SettingsProfile,
  UpdateSettingsProfilePayload,
} from '@frontend/src/app/core/api/settings.api';
import {
  createDefaultParams,
  normalizeParams,
  extractExtras,
  prettyJson,
  mergeForSave,
} from '@frontend/src/app/core/utils/settings-params.util';
import { AutoResizeDirective } from '@frontend/src/app/core/directives/textarea/auto-size.directive';
import { I18nPipe } from '../../../../core/i18n/i18n.pipe';
import { isRecord } from '../../../../core/utils/typed-access';
import { SettingsParams } from '@shared/index';

@Component({
  selector: 'app-profile-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, AutoResizeDirective, I18nPipe],
  templateUrl: './profile-editor.html',
  styleUrl: './profile-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileEditor implements OnChanges {
  @Input() profile: SettingsProfile | null = null;

  @Input() models: ModelListItemDto[] | null = null;
  @Input() modelsLoading: boolean | null = null;

  // Functions provided by container to query per-model state.
  @Input() isModelBusyFn!: (id: string) => boolean;
  @Input() isModelLoadedFn!: (id: string) => boolean;

  @Output() save = new EventEmitter<{ id: string; patch: UpdateSettingsProfilePayload }>();
  @Output() setDefaultId = new EventEmitter<string>();
  @Output() loadModelId = new EventEmitter<string>();
  @Output() unloadModelId = new EventEmitter<string>();

  // Local form state
  editName = '';
  editParams: SettingsParams = createDefaultParams();

  showAdvanced = false;
  advancedJson = '{\n  \n}';
  advancedJsonError: string | null = null;

  currentModelMaxLength: number = 10000;

  // Snapshot for "unsaved changes" detection
  private baseline: { name: string; params: SettingsParams; extrasJson: string } | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['profile']) {
      this.hydrateFromProfile();
    }
  }

  get hasSelection(): boolean {
    return !!this.profile?.id;
  }

  get isDefault(): boolean {
    return !!this.profile?.isDefault;
  }

  get isDirty(): boolean {
    if (!this.baseline) return false;
    const editParams = stableStringify(normalizeParams(this.editParams));
    const baseParams = stableStringify(this.baseline.params);
    const baseSame = this.editName === this.baseline.name && editParams === baseParams;
    const advSame =
      (this.showAdvanced ? this.advancedJson.trim() : this.baseline.extrasJson.trim()) ===
      this.baseline.extrasJson.trim();
    return !(baseSame && advSame);
  }

  hydrateFromProfile(): void {
    const p = this.profile;
    if (!p) {
      this.baseline = null;
      return;
    }

    this.editName = p.name ?? '';
    const normalized = normalizeParams(p.params ?? {});
    this.editParams = normalized;

    const extras = extractExtras(normalized);
    this.advancedJson = prettyJson(extras);
    this.advancedJsonError = null;
    this.showAdvanced = false;

    const params = JSON.parse(JSON.stringify(normalized)) as SettingsParams;

    this.baseline = {
      name: this.editName,
      params,
      extrasJson: this.advancedJson,
    };
  }

  onModelChanged(e: Event & { target: HTMLSelectElement }) {
    const value = e.target.value;
    const model = this.models?.find((m) => m.id === value);
    if (model) {
      this.currentModelMaxLength = parseInt((model.maxContextLength || 8000) * 0.95 + '');
      if (this.editParams.maxTokens) {
        if (this.editParams.maxTokens > this.currentModelMaxLength) {
          this.editParams.maxTokens = parseInt((model.maxContextLength || 8000) * 0.8 + '');
        }
      }
    }
  }

  onMaxTokenChange(e: Event & { target: HTMLInputElement }) {
    const max = parseInt(e.target.max);
    const value = parseInt(e.target.value);
    console.log(max, value);

    if (value > max) {
      e.target.value = max + '';
    }
  }

  onToggleAdvanced(): void {
    this.showAdvanced = !this.showAdvanced;
    this.advancedJsonError = null;

    // Refresh JSON from current params when opening.
    if (this.showAdvanced) {
      this.advancedJson = prettyJson(extractExtras(this.editParams));
    }
  }

  onSave(): void {
    if (!this.profile?.id) return;

    const name = (this.editName ?? '').trim();
    if (!name) return;

    const base = normalizeParams(this.editParams);
    const merged = mergeForSave(base, this.showAdvanced, this.advancedJson);

    if (!merged.params) {
      this.advancedJsonError = merged.error;
      return;
    }

    const patch: UpdateSettingsProfilePayload = {
      name,
      params: merged.params,
    };

    this.save.emit({ id: this.profile.id, patch });

    // Update baseline immediately for better UX (optimistic).
    this.baseline = {
      name,
      params: normalizeParams(merged.params),
      extrasJson: prettyJson(extractExtras(merged.params)),
    };
    this.showAdvanced = false;
    this.advancedJson = this.baseline.extrasJson;
    this.advancedJsonError = null;
  }

  onSetDefault(): void {
    if (!this.profile?.id) return;
    this.setDefaultId.emit(this.profile.id);
  }

  onLoadModel(): void {
    const id = (this.editParams.modelKey ?? '').trim();
    if (!id) return;
    this.loadModelId.emit(id);
  }

  onUnloadModel(): void {
    const id = (this.editParams.modelKey ?? '').trim();
    if (!id) return;
    this.unloadModelId.emit(id);
  }
}

// Basic stable stringify for dirty check.
// NOTE: This is good enough for UI state. Keep it simple.
function stableStringify(x: unknown): string {
  return JSON.stringify(sortObject(x));
}

function sortObject(x: unknown): unknown {
  if (!x || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map(sortObject);
  if (!isRecord(x)) return x;

  return Object.keys(x)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = sortObject(x[k]);
      return acc;
    }, {});
}
