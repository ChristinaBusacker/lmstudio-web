import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'node:path';
import { ChatRunsModule } from './chat-runs/chat-runs.module';
import { ChatsModule } from './chats/chats.module';
import { ChatEntity } from './chats/entities/chat.entity';
import { MessageEntity } from './chats/entities/message.entity';
import { ModelsModule } from './models/models.module';
import { RunEntity } from './runs/entities/run.entity';
import { RunsModule } from './runs/runs.module';
import { GenerationSettingsProfileEntity } from './settings/entities/generation-settings-profile.entity';
import { SettingsModule } from './settings/settings.module';

const dbPath = process.env.DB_PATH
  ? process.env.DB_PATH
  : path.join(process.cwd(), 'data', 'app.sqlite');

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'sqlite',
        database: dbPath,

        // IMPORTANT: migrations > synchronize
        synchronize: false,
        migrationsRun: false,
        autoLoadEntities: true,
        entities: [ChatEntity, MessageEntity, RunEntity, GenerationSettingsProfileEntity],
        migrations: [__dirname + '/migrations/*.{ts,js}'],

        logging: ['error', 'warn'],
      }),
    }),
    ChatsModule,
    RunsModule,
    ChatRunsModule,
    SettingsModule,
    ModelsModule,
  ],
})
export class AppModule {}
