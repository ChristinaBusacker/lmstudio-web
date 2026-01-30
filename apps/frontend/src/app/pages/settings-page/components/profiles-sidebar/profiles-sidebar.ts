import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { createDefaultParams } from '@frontend/src/app/core/utils/settings-params.util';
import {
  SettingsProfile,
  CreateSettingsProfilePayload,
} from '@frontend/src/app/core/api/settings.api';

@Component({
  selector: 'app-profiles-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profiles-sidebar.html',
  styleUrl: './profiles-sidebar.scss',
})
export class ProfilesSidebar {
  @Input() profiles: SettingsProfile[] | null = null;
  @Input() selectedId: string | null = null;

  @Output() reload = new EventEmitter<void>();
  @Output() selectId = new EventEmitter<string>();
  @Output() setDefaultId = new EventEmitter<string>();
  @Output() deleteProfileId = new EventEmitter<string>();
  @Output() create = new EventEmitter<CreateSettingsProfilePayload>();

  // Local UI state
  filter = '';
  createName = '';
  createAsDefault = false;

  get filteredProfiles(): SettingsProfile[] {
    const list = this.profiles ?? [];
    const q = (this.filter ?? '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) => (p.name ?? '').toLowerCase().includes(q) || (p.id ?? '').toLowerCase().includes(q),
    );
  }

  onCreate(): void {
    const name = (this.createName ?? '').trim();
    if (!name) return;

    const payload: CreateSettingsProfilePayload = {
      name,
      params: createDefaultParams(),
      isDefault: this.createAsDefault,
    };

    this.create.emit(payload);
    this.createName = '';
    this.createAsDefault = false;
  }
}
