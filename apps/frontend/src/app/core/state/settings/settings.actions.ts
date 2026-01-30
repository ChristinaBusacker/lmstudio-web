// Comments in English as requested.

import { CreateSettingsProfilePayload, UpdateSettingsProfilePayload } from '../../api/settings.api';

export class LoadProfiles {
  static readonly type = '[Settings] Load Profiles';
}

export class LoadProfileById {
  static readonly type = '[Settings] Load Profile By Id';
  constructor(public readonly id: string) {}
}

export class CreateProfile {
  static readonly type = '[Settings] Create Profile';
  constructor(public readonly payload: CreateSettingsProfilePayload) {}
}

export class UpdateProfile {
  static readonly type = '[Settings] Update Profile';
  constructor(
    public readonly id: string,
    public readonly patch: UpdateSettingsProfilePayload,
  ) {}
}

export class SetDefaultProfile {
  static readonly type = '[Settings] Set Default Profile';
  constructor(public readonly id: string) {}
}

export class DeleteProfile {
  static readonly type = '[Settings] Delete Profile';
  constructor(public readonly id: string) {}
}

export class ClearError {
  static readonly type = '[Settings] Clear Error';
}
