// Comments in English as requested.

import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ModelListItemDto } from '@frontend/src/app/core/api/models.api';

@Component({
  selector: 'app-models-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './models-panel.html',
  styleUrl: './models-panel.scss',
})
export class ModelsPanel {
  @Input() models: ModelListItemDto[] | null = null;
  @Input() loading: boolean | null = null;

  // Function from container to query model busy state.
  @Input() isBusyFn!: (id: string) => any;

  @Output() loadModelId = new EventEmitter<string>();
  @Output() unloadModelId = new EventEmitter<string>();
  @Output() reloadModels = new EventEmitter<void>();

  filter = '';

  get loadedModels(): ModelListItemDto[] {
    return this.filterModels((m) => m.state === 'loaded');
  }

  get notLoadedModels(): ModelListItemDto[] {
    return this.filterModels((m) => m.state === 'not-loaded');
  }

  private filterModels(predicate: (m: ModelListItemDto) => boolean): ModelListItemDto[] {
    const list = this.models ?? [];
    const q = (this.filter ?? '').trim().toLowerCase();

    return list.filter(predicate).filter((m) => !q || (m.id ?? '').toLowerCase().includes(q));
  }

  onLoad(id: string): void {
    if (!id) return;
    this.loadModelId.emit(id);
  }

  onUnload(id: string): void {
    if (!id) return;
    this.unloadModelId.emit(id);
  }
}
