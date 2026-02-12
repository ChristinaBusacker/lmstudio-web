/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { ChatRunsModule } from './chat-runs/chat-runs.module';
import { ChatsModule } from './chats/chats.module';
import { ChatEntity } from './chats/entities/chat.entity';
import { MessageEntity } from './chats/entities/message.entity';
import { ModelsModule } from './models/models.module';
import { RunEntity } from './runs/entities/run.entity';
import { RunsModule } from './runs/runs.module';
import { SearchModule } from './search/search.module';
import { GenerationSettingsProfileEntity } from './settings/entities/generation-settings-profile.entity';
import { SettingsModule } from './settings/settings.module';
import { ArtifactEntity } from './workflows/entities/artifact.entity';
import { WorkflowNodeRunEntity } from './workflows/entities/workflow-node-run.entity';
import { WorkflowRunEntity } from './workflows/entities/workflow-run.entity';
import { WorkflowEntity } from './workflows/entities/workflow.entity';
import { WorkflowsModule } from './workflows/workflows.module';

const distRoot = __dirname;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'sqlite',
        database: config.get('DB_PATH', join(distRoot, 'data', 'app.sqlite')),
        synchronize: false,
        migrationsRun: true,
        autoLoadEntities: true,
        entities: [
          ChatEntity,
          MessageEntity,
          RunEntity,
          GenerationSettingsProfileEntity,
          WorkflowEntity,
          WorkflowRunEntity,
          ArtifactEntity,
          WorkflowNodeRunEntity,
        ],

        migrations: [join(__dirname, 'migrations', '*.{js,ts}')],
        logging: ['error', 'warn'],
      }),
    }),
    ChatsModule,
    RunsModule,
    ChatRunsModule,
    SettingsModule,
    ModelsModule,
    SearchModule,
    WorkflowsModule,
  ],
})
export class AppModule {}
