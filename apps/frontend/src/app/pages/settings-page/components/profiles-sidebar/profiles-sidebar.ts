import {
  Component,
  EventEmitter,
  inject,
  Input,
  Output,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { createDefaultParams } from '@frontend/src/app/core/utils/settings-params.util';
import {
  SettingsProfile,
  CreateSettingsProfilePayload,
} from '@frontend/src/app/core/api/settings.api';
import { DialogService } from '@frontend/src/app/ui/dialog/dialog.service';
import { Icon } from '@frontend/src/app/ui/icon/icon';
import { i18n } from '@frontend/src/app/core/i18n/i18n.util';
import { I18nPipe } from '../../../../core/i18n/i18n.pipe';

@Component({
  selector: 'app-profiles-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, Icon, I18nPipe],
  templateUrl: './profiles-sidebar.html',
  styleUrl: './profiles-sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilesSidebar {
  dialog = inject(DialogService);

  @Input() profiles: SettingsProfile[] | null = null;
  @Input() selectedId: string | null = null;

  @Output() reload = new EventEmitter<void>();
  @Output() selectId = new EventEmitter<string>();
  @Output() setDefaultId = new EventEmitter<string>();
  @Output() deleteProfileId = new EventEmitter<string>();
  @Output() create = new EventEmitter<CreateSettingsProfilePayload>();

  // Local UI state
  filter = '';

  get filteredProfiles(): SettingsProfile[] {
    const list = this.profiles ?? [];
    const q = (this.filter ?? '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) => (p.name ?? '').toLowerCase().includes(q) || (p.id ?? '').toLowerCase().includes(q),
    );
  }

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
        if (result.action === 'confirm' && result.data) {
          const payload: CreateSettingsProfilePayload = {
            name: result.data,
            params: createDefaultParams(),
            isDefault: false,
          };

          this.create.emit(payload);
        }
      });
  }
}
