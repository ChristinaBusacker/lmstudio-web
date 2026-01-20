import { Module } from '@nestjs/common';
import { LmStudioSdkModule } from '../infra/lmstudio/lmstudio-sdk.module';
import { ModelsService } from './models.service';
import { ModelsController } from './models.controller';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [LmStudioSdkModule, SseModule],
  providers: [ModelsService],
  exports: [ModelsService],
  controllers: [ModelsController],
})
export class ModelsModule {}
