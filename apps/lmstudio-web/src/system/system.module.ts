import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SseModule } from '../sse/sse.module';
import { ExternalServicesMonitorService } from './external-services-monitor.service';
import { SystemController } from './system.controller';

@Module({
  imports: [ConfigModule, SseModule],
  controllers: [SystemController],
  providers: [ExternalServicesMonitorService],
  exports: [ExternalServicesMonitorService],
})
export class SystemModule {}
