/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule, ServeStaticModuleOptions } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as path from 'node:path';
import { join } from 'path';
import { ChatRunsModule } from './chat-runs/chat-runs.module';
import { ChatsModule } from './chats/chats.module';
import { ChatEntity } from './chats/entities/chat.entity';
import { MessageEntity } from './chats/entities/message.entity';
import { ModelsModule } from './models/models.module';
import { RunEntity } from './runs/entities/run.entity';
import { RunsModule } from './runs/runs.module';
import { GenerationSettingsProfileEntity } from './settings/entities/generation-settings-profile.entity';
import { SettingsModule } from './settings/settings.module';
import { SearchModule } from './search/search.module';

const dbPath = process.env.DB_PATH
  ? process.env.DB_PATH
  : path.join(process.cwd(), 'data', 'app.sqlite');

const uiOptions: ServeStaticModuleOptions = {
  rootPath: join(__dirname, '..', 'ui'),
  serveRoot: '/ui',
  exclude: ['/api*'],
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => ({
        type: 'sqlite',
        database: dbPath,
        synchronize: false,
        migrationsRun: false,
        autoLoadEntities: true,
        entities: [ChatEntity, MessageEntity, RunEntity, GenerationSettingsProfileEntity],
        migrations: [__dirname + '/migrations/*.{ts,js}'],
        logging: ['error', 'warn'],
      }),
    }),

    ServeStaticModule.forRoot(uiOptions),
    ChatsModule,
    RunsModule,
    ChatRunsModule,
    SettingsModule,
    ModelsModule,
    SearchModule,
  ],
})
export class AppModule {}
