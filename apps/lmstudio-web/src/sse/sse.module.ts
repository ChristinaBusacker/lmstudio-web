import { Module } from '@nestjs/common';
import { SseBusService } from './sse-bus.service';
import { SseController } from './sse.controller';

@Module({
  controllers: [SseController],
  providers: [SseBusService],
  exports: [SseBusService],
})
export class SseModule {}
