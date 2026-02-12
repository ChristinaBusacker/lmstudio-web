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

@Component({
  selector: 'app-profiles-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, Icon],
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
        title: 'Profile name',
        placeholder: 'Enter a profile name...',
        initialValue: '',
        hint: 'Choose a descriptive profile title. For example purpose or specific model you want to appned to this profile.',
        confirmLabel: 'Save',
        declineLabel: 'Cancel',
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
