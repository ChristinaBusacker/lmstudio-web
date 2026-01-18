import { Module } from '@nestjs/common';
import { LmStudioSdkModule } from '../infra/lmstudio/lmstudio-sdk.module';
import { ModelsService } from './models.service';

@Module({
  imports: [LmStudioSdkModule],
  providers: [ModelsService],
  exports: [ModelsService],
})
export class ModelsModule {}
