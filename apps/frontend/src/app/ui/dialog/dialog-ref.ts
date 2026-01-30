import { Observable, Subject } from 'rxjs';
import { DialogResult } from './dialog.types';

export class DialogRef<T = unknown> {
  private readonly closed$ = new Subject<DialogResult<T>>();
  private isClosed = false;

  close(result: DialogResult<T>): void {
    if (this.isClosed) return;
    this.isClosed = true;
    this.closed$.next(result);
    this.closed$.complete();
  }

  afterClosed(): Observable<DialogResult<T>> {
    return this.closed$.asObservable();
  }
}
