import { Module } from '@nestjs/common';
import { LmStudioClientFactory } from './lmstudio-client.factory';

@Module({
  providers: [LmStudioClientFactory],
  exports: [LmStudioClientFactory],
})
export class LmStudioSdkModule {}
