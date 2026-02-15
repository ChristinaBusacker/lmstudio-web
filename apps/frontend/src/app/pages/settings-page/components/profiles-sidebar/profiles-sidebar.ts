import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { createDefaultParams } from '@frontend/src/app/core/utils/settings-params.util';
import {
  CreateSettingsProfilePayload,
  SettingsProfile,
} from '@frontend/src/app/core/api/settings.api';
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
}
