import { Injectable } from '@angular/core';
import { Action, Selector, State, StateContext } from '@ngxs/store';
import { ExternalStatusChanged } from './system.actions';
import type { ExternalServiceStatus, SystemStateModel } from './system.models';

@State<SystemStateModel>({
  name: 'system',
  defaults: {
    external: {},
  },
})
@Injectable()
export class SystemState {
  @Selector()
  static external(state: SystemStateModel): Record<string, ExternalServiceStatus> {
    return state.external;
  }

  @Selector()
  static service(
    state: SystemStateModel,
  ): (name: string) => ExternalServiceStatus | null {
    return (name: string) => state.external[name] ?? null;
  }

  @Action(ExternalStatusChanged)
  externalStatusChanged(ctx: StateContext<SystemStateModel>, action: ExternalStatusChanged) {
    const next: Record<string, ExternalServiceStatus> = { ...ctx.getState().external };
    for (const s of action.services ?? []) {
      if (!s?.name) continue;
      next[s.name] = s;
    }
    ctx.patchState({ external: next });
  }
}
