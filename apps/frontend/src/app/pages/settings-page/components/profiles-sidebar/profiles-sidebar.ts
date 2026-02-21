import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { createDefaultParams } from '@frontend/src/app/core/utils/settings-params.util';
import {
  CreateSettingsProfilePayload,
  SettingsProfile,
} from '@frontend/src/app/core/api/settings.api';
import { SettingsApiService } from '@frontend/src/app/core/api/settings.api';
import { DialogService } from '@frontend/src/app/ui/dialog/dialog.service';
import { Icon } from '@frontend/src/app/ui/icon/icon';
import { i18n } from '@frontend/src/app/core/i18n/i18n.util';
import { I18nPipe } from '../../../../core/i18n/i18n.pipe';

@Component({
  selector: 'app-profiles-sidebar',
  standalone: true,
  imports: [CommonModule, Icon, I18nPipe],
  templateUrl: './profiles-sidebar.html',
  styleUrl: './profiles-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilesSidebar {
  private readonly dialog = inject(DialogService);
  private readonly api = inject(SettingsApiService);

  // File input for profile import
  readonly importFile = viewChild.required<ElementRef<HTMLInputElement>>('importFile');

  // Angular 21 style: signal-based inputs/outputs
  readonly profiles = input<SettingsProfile[] | null>(null);
  readonly selectedId = input<string | null>(null);

  readonly reload = output<void>();
  readonly selectId = output<string>();
  readonly setDefaultId = output<string>();
  readonly deleteProfileId = output<string>();
  readonly create = output<CreateSettingsProfilePayload>();

  // Local state as signals
  readonly filter = signal('');

  // Derived state as computed
  readonly filteredProfiles = computed<SettingsProfile[]>(() => {
    const list = this.profiles() ?? [];
    const q = this.filter().trim().toLowerCase();
    if (!q) return list;

    return list.filter((p) => {
      const name = (p.name ?? '').toLowerCase();
      const id = (p.id ?? '').toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  });

  onCreate(): void {
    this.dialog
      .prompt({
        title: i18n('profiles.createPrompt.title'),
        placeholder: i18n('profiles.createPrompt.placeholder'),
        initialValue: '',
        hint: i18n('profiles.createPrompt.hint'),
        confirmLabel: i18n('common.save'),
        declineLabel: i18n('common.cancel'),
      })
      .afterClosed()
      .subscribe((result) => {
        if (result.action !== 'confirm' || !result.data) return;

        const payload: CreateSettingsProfilePayload = {
          name: result.data,
          params: createDefaultParams(),
          isDefault: false,
        };

        this.create.emit(payload);
      });
  }

  selectProfile(profileId: string): void {
    this.selectId.emit(profileId);
  }

  onFilterInput(value: string): void {
    this.filter.set(value);
  }

  triggerImport(): void {
    // Reset to allow importing the same file again.
    const el = this.importFile();
    el.nativeElement.value = '';
    el.nativeElement.click();
  }

  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;

    file
      .text()
      .then((raw) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          this.dialog.confirm({
            title: i18n('common.error'),
            message: i18n('profiles.importInvalidJson'),
            confirmLabel: i18n('common.close'),
            declineLabel: null,
            closeLabel: null,
          });
          return;
        }

        this.api.importProfile(parsed as any).subscribe({
          next: () => {
            this.reload.emit();
          },
          error: (err) => {
            const msg = err?.error?.message ?? err?.message ?? i18n('profiles.importFailed');
            this.dialog.confirm({
              title: i18n('common.error'),
              message: String(msg),
              confirmLabel: i18n('common.close'),
              declineLabel: null,
              closeLabel: null,
            });
          },
        });
      })
      .catch(() => {
        this.dialog.confirm({
          title: i18n('common.error'),
          message: i18n('profiles.importFailed'),
          confirmLabel: i18n('common.close'),
          declineLabel: null,
          closeLabel: null,
        });
      });
  }

  exportProfile(profileId: string): void {
    this.api.exportProfile(profileId).subscribe({
      next: (bundle) => {
        const name = (bundle?.profile?.name ?? 'settings-profile').replace(/[^\w\-]+/g, '_');
        const filename = `${name}.settings.json`;
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        const msg = err?.error?.message ?? err?.message ?? i18n('profiles.exportFailed');
        this.dialog.confirm({
          title: i18n('common.error'),
          message: String(msg),
          confirmLabel: i18n('common.close'),
          declineLabel: null,
          closeLabel: null,
        });
      },
    });
  }
}
