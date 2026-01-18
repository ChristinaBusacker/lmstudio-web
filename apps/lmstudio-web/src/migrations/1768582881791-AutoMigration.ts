import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1768582881791 implements MigrationInterface {
    name = 'AutoMigration1768582881791'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "generation_settings_profile" ("id" varchar PRIMARY KEY NOT NULL, "ownerKey" varchar(64) NOT NULL DEFAULT ('default'), "name" varchar(120) NOT NULL, "isDefault" boolean NOT NULL DEFAULT (0), "params" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_b293b7e0feee988db5325477e9" ON "generation_settings_profile" ("ownerKey") `);
        await queryRunner.query(`CREATE INDEX "IDX_22e3da7436a3f09752d0a974e9" ON "generation_settings_profile" ("ownerKey", "isDefault") `);
        await queryRunner.query(`CREATE TABLE "message" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar(36) NOT NULL, "role" varchar(16) NOT NULL, "content" text NOT NULL, "reasoning" text, "runId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_619bc7b78eba833d2044153bac" ON "message" ("chatId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f7fe6d097dd261b8db465fd318" ON "message" ("runId") `);
        await queryRunner.query(`CREATE INDEX "IDX_93a28d680f3f131dea7415e0bf" ON "message" ("chatId", "createdAt") `);
        await queryRunner.query(`CREATE TABLE "chat" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar(200), "defaultSettingsProfileId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_735274924ad41f45b7688ce71b" ON "chat" ("defaultSettingsProfileId") `);
        await queryRunner.query(`CREATE TABLE "run" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar(36) NOT NULL, "queueKey" varchar(64) NOT NULL DEFAULT ('default'), "clientRequestId" varchar(64) NOT NULL, "status" varchar(16) NOT NULL, "settingsProfileId" varchar(36), "settingsSnapshot" text NOT NULL, "promptProfileHash" varchar(128), "content" text NOT NULL DEFAULT (''), "stats" text, "error" text, "lockedBy" varchar(64), "lockedAt" datetime, "startedAt" datetime, "finishedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_6a0025590c2eb6b63c2a0bdb83" ON "run" ("chatId") `);
        await queryRunner.query(`CREATE INDEX "IDX_0bdbaef6cb7cf6fd5049b239f1" ON "run" ("settingsProfileId") `);
        await queryRunner.query(`CREATE INDEX "IDX_e1d4ce012ab24f0c8653f9b224" ON "run" ("lockedBy") `);
        await queryRunner.query(`CREATE INDEX "IDX_c7ce474658b34fc55b81a336b1" ON "run" ("lockedAt") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_185fc5177219f0e7275361862c" ON "run" ("queueKey", "clientRequestId") `);
        await queryRunner.query(`CREATE INDEX "IDX_4b043c0a4b7d22b49561ab5c5e" ON "run" ("status", "updatedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_ea8f234cac0aa04b9e7c62c5d7" ON "run" ("chatId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_0925d787d946441bcb260301ed" ON "run" ("queueKey", "status", "createdAt") `);
        await queryRunner.query(`DROP INDEX "IDX_619bc7b78eba833d2044153bac"`);
        await queryRunner.query(`DROP INDEX "IDX_f7fe6d097dd261b8db465fd318"`);
        await queryRunner.query(`DROP INDEX "IDX_93a28d680f3f131dea7415e0bf"`);
        await queryRunner.query(`CREATE TABLE "temporary_message" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar(36) NOT NULL, "role" varchar(16) NOT NULL, "content" text NOT NULL, "reasoning" text, "runId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_619bc7b78eba833d2044153bacc" FOREIGN KEY ("chatId") REFERENCES "chat" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_message"("id", "chatId", "role", "content", "reasoning", "runId", "createdAt") SELECT "id", "chatId", "role", "content", "reasoning", "runId", "createdAt" FROM "message"`);
        await queryRunner.query(`DROP TABLE "message"`);
        await queryRunner.query(`ALTER TABLE "temporary_message" RENAME TO "message"`);
        await queryRunner.query(`CREATE INDEX "IDX_619bc7b78eba833d2044153bac" ON "message" ("chatId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f7fe6d097dd261b8db465fd318" ON "message" ("runId") `);
        await queryRunner.query(`CREATE INDEX "IDX_93a28d680f3f131dea7415e0bf" ON "message" ("chatId", "createdAt") `);
        await queryRunner.query(`DROP INDEX "IDX_6a0025590c2eb6b63c2a0bdb83"`);
        await queryRunner.query(`DROP INDEX "IDX_0bdbaef6cb7cf6fd5049b239f1"`);
        await queryRunner.query(`DROP INDEX "IDX_e1d4ce012ab24f0c8653f9b224"`);
        await queryRunner.query(`DROP INDEX "IDX_c7ce474658b34fc55b81a336b1"`);
        await queryRunner.query(`DROP INDEX "IDX_185fc5177219f0e7275361862c"`);
        await queryRunner.query(`DROP INDEX "IDX_4b043c0a4b7d22b49561ab5c5e"`);
        await queryRunner.query(`DROP INDEX "IDX_ea8f234cac0aa04b9e7c62c5d7"`);
        await queryRunner.query(`DROP INDEX "IDX_0925d787d946441bcb260301ed"`);
        await queryRunner.query(`CREATE TABLE "temporary_run" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar(36) NOT NULL, "queueKey" varchar(64) NOT NULL DEFAULT ('default'), "clientRequestId" varchar(64) NOT NULL, "status" varchar(16) NOT NULL, "settingsProfileId" varchar(36), "settingsSnapshot" text NOT NULL, "promptProfileHash" varchar(128), "content" text NOT NULL DEFAULT (''), "stats" text, "error" text, "lockedBy" varchar(64), "lockedAt" datetime, "startedAt" datetime, "finishedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_6a0025590c2eb6b63c2a0bdb83f" FOREIGN KEY ("chatId") REFERENCES "chat" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_run"("id", "chatId", "queueKey", "clientRequestId", "status", "settingsProfileId", "settingsSnapshot", "promptProfileHash", "content", "stats", "error", "lockedBy", "lockedAt", "startedAt", "finishedAt", "createdAt", "updatedAt") SELECT "id", "chatId", "queueKey", "clientRequestId", "status", "settingsProfileId", "settingsSnapshot", "promptProfileHash", "content", "stats", "error", "lockedBy", "lockedAt", "startedAt", "finishedAt", "createdAt", "updatedAt" FROM "run"`);
        await queryRunner.query(`DROP TABLE "run"`);
        await queryRunner.query(`ALTER TABLE "temporary_run" RENAME TO "run"`);
        await queryRunner.query(`CREATE INDEX "IDX_6a0025590c2eb6b63c2a0bdb83" ON "run" ("chatId") `);
        await queryRunner.query(`CREATE INDEX "IDX_0bdbaef6cb7cf6fd5049b239f1" ON "run" ("settingsProfileId") `);
        await queryRunner.query(`CREATE INDEX "IDX_e1d4ce012ab24f0c8653f9b224" ON "run" ("lockedBy") `);
        await queryRunner.query(`CREATE INDEX "IDX_c7ce474658b34fc55b81a336b1" ON "run" ("lockedAt") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_185fc5177219f0e7275361862c" ON "run" ("queueKey", "clientRequestId") `);
        await queryRunner.query(`CREATE INDEX "IDX_4b043c0a4b7d22b49561ab5c5e" ON "run" ("status", "updatedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_ea8f234cac0aa04b9e7c62c5d7" ON "run" ("chatId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_0925d787d946441bcb260301ed" ON "run" ("queueKey", "status", "createdAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_0925d787d946441bcb260301ed"`);
        await queryRunner.query(`DROP INDEX "IDX_ea8f234cac0aa04b9e7c62c5d7"`);
        await queryRunner.query(`DROP INDEX "IDX_4b043c0a4b7d22b49561ab5c5e"`);
        await queryRunner.query(`DROP INDEX "IDX_185fc5177219f0e7275361862c"`);
        await queryRunner.query(`DROP INDEX "IDX_c7ce474658b34fc55b81a336b1"`);
        await queryRunner.query(`DROP INDEX "IDX_e1d4ce012ab24f0c8653f9b224"`);
        await queryRunner.query(`DROP INDEX "IDX_0bdbaef6cb7cf6fd5049b239f1"`);
        await queryRunner.query(`DROP INDEX "IDX_6a0025590c2eb6b63c2a0bdb83"`);
        await queryRunner.query(`ALTER TABLE "run" RENAME TO "temporary_run"`);
        await queryRunner.query(`CREATE TABLE "run" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar(36) NOT NULL, "queueKey" varchar(64) NOT NULL DEFAULT ('default'), "clientRequestId" varchar(64) NOT NULL, "status" varchar(16) NOT NULL, "settingsProfileId" varchar(36), "settingsSnapshot" text NOT NULL, "promptProfileHash" varchar(128), "content" text NOT NULL DEFAULT (''), "stats" text, "error" text, "lockedBy" varchar(64), "lockedAt" datetime, "startedAt" datetime, "finishedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "run"("id", "chatId", "queueKey", "clientRequestId", "status", "settingsProfileId", "settingsSnapshot", "promptProfileHash", "content", "stats", "error", "lockedBy", "lockedAt", "startedAt", "finishedAt", "createdAt", "updatedAt") SELECT "id", "chatId", "queueKey", "clientRequestId", "status", "settingsProfileId", "settingsSnapshot", "promptProfileHash", "content", "stats", "error", "lockedBy", "lockedAt", "startedAt", "finishedAt", "createdAt", "updatedAt" FROM "temporary_run"`);
        await queryRunner.query(`DROP TABLE "temporary_run"`);
        await queryRunner.query(`CREATE INDEX "IDX_0925d787d946441bcb260301ed" ON "run" ("queueKey", "status", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_ea8f234cac0aa04b9e7c62c5d7" ON "run" ("chatId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_4b043c0a4b7d22b49561ab5c5e" ON "run" ("status", "updatedAt") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_185fc5177219f0e7275361862c" ON "run" ("queueKey", "clientRequestId") `);
        await queryRunner.query(`CREATE INDEX "IDX_c7ce474658b34fc55b81a336b1" ON "run" ("lockedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_e1d4ce012ab24f0c8653f9b224" ON "run" ("lockedBy") `);
        await queryRunner.query(`CREATE INDEX "IDX_0bdbaef6cb7cf6fd5049b239f1" ON "run" ("settingsProfileId") `);
        await queryRunner.query(`CREATE INDEX "IDX_6a0025590c2eb6b63c2a0bdb83" ON "run" ("chatId") `);
        await queryRunner.query(`DROP INDEX "IDX_93a28d680f3f131dea7415e0bf"`);
        await queryRunner.query(`DROP INDEX "IDX_f7fe6d097dd261b8db465fd318"`);
        await queryRunner.query(`DROP INDEX "IDX_619bc7b78eba833d2044153bac"`);
        await queryRunner.query(`ALTER TABLE "message" RENAME TO "temporary_message"`);
        await queryRunner.query(`CREATE TABLE "message" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar(36) NOT NULL, "role" varchar(16) NOT NULL, "content" text NOT NULL, "reasoning" text, "runId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "message"("id", "chatId", "role", "content", "reasoning", "runId", "createdAt") SELECT "id", "chatId", "role", "content", "reasoning", "runId", "createdAt" FROM "temporary_message"`);
        await queryRunner.query(`DROP TABLE "temporary_message"`);
        await queryRunner.query(`CREATE INDEX "IDX_93a28d680f3f131dea7415e0bf" ON "message" ("chatId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_f7fe6d097dd261b8db465fd318" ON "message" ("runId") `);
        await queryRunner.query(`CREATE INDEX "IDX_619bc7b78eba833d2044153bac" ON "message" ("chatId") `);
        await queryRunner.query(`DROP INDEX "IDX_0925d787d946441bcb260301ed"`);
        await queryRunner.query(`DROP INDEX "IDX_ea8f234cac0aa04b9e7c62c5d7"`);
        await queryRunner.query(`DROP INDEX "IDX_4b043c0a4b7d22b49561ab5c5e"`);
        await queryRunner.query(`DROP INDEX "IDX_185fc5177219f0e7275361862c"`);
        await queryRunner.query(`DROP INDEX "IDX_c7ce474658b34fc55b81a336b1"`);
        await queryRunner.query(`DROP INDEX "IDX_e1d4ce012ab24f0c8653f9b224"`);
        await queryRunner.query(`DROP INDEX "IDX_0bdbaef6cb7cf6fd5049b239f1"`);
        await queryRunner.query(`DROP INDEX "IDX_6a0025590c2eb6b63c2a0bdb83"`);
        await queryRunner.query(`DROP TABLE "run"`);
        await queryRunner.query(`DROP INDEX "IDX_735274924ad41f45b7688ce71b"`);
        await queryRunner.query(`DROP TABLE "chat"`);
        await queryRunner.query(`DROP INDEX "IDX_93a28d680f3f131dea7415e0bf"`);
        await queryRunner.query(`DROP INDEX "IDX_f7fe6d097dd261b8db465fd318"`);
        await queryRunner.query(`DROP INDEX "IDX_619bc7b78eba833d2044153bac"`);
        await queryRunner.query(`DROP TABLE "message"`);
        await queryRunner.query(`DROP INDEX "IDX_22e3da7436a3f09752d0a974e9"`);
        await queryRunner.query(`DROP INDEX "IDX_b293b7e0feee988db5325477e9"`);
        await queryRunner.query(`DROP TABLE "generation_settings_profile"`);
    }

}
