import { Injectable, signal } from '@angular/core';

@Injectable()
export class DialogContext<T = unknown> {
  readonly result = signal<T | undefined>(undefined);

  setResult(value: T): void {
    this.result.set(value);
  }

  clear(): void {
    this.result.set(undefined);
  }
}
