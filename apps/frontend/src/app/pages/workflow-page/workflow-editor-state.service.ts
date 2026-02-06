import { Injectable, signal } from '@angular/core';

/**
 * Small state holder for the workflow editor.
 *
 * Responsibilities:
 * - track whether the editor is dirty (unsaved changes)
 * - provide a "snapshot request" mechanism so UI components (e.g. node editors)
 *   can ask the diagram facade to push an undo snapshot before a burst of edits
 */
@Injectable()
export class WorkflowEditorStateService {
  readonly dirty = signal(false);

  private readonly _snapshotRequested = signal(false);
  readonly snapshotRequested = this._snapshotRequested.asReadonly();

  markDirty(): void {
    this.dirty.set(true);
  }

  clearDirty(): void {
    this.dirty.set(false);
  }

  requestSnapshot(): void {
    this._snapshotRequested.set(true);
  }

  consumeSnapshotRequest(): boolean {
    const requested = this._snapshotRequested();
    if (requested) this._snapshotRequested.set(false);
    return requested;
  }
}
