import type { ExternalServiceStatus } from './system.models';

export class ExternalStatusChanged {
  static readonly type = '[System] External Status Changed';
  constructor(public readonly services: ExternalServiceStatus[]) {}
}
