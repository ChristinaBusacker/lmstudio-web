import { Module } from '@nestjs/common';
import { ModelsService } from './models.service';
import { ModelsController } from './models.controller';
import { SseModule } from '../sse/sse.module';

@Module({
  imports: [SseModule],
  providers: [ModelsService],
  exports: [ModelsService],
  controllers: [ModelsController],
})
export class ModelsModule {}
