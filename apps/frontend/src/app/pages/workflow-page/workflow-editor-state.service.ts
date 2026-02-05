import { Injectable, signal } from '@angular/core';

@Injectable()
export class WorkflowEditorStateService {
  readonly dirty = signal(false);

  private _snapshotRequested = signal(false);
  readonly snapshotRequested = this._snapshotRequested.asReadonly();

  markDirty() {
    this.dirty.set(true);
  }

  clearDirty() {
    this.dirty.set(false);
  }

  requestSnapshot() {
    this._snapshotRequested.set(true);
  }

  consumeSnapshotRequest(): boolean {
    const v = this._snapshotRequested();
    if (v) this._snapshotRequested.set(false);
    return v;
  }
}
