import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1768656191817 implements MigrationInterface {
    name = 'AutoMigration1768656191817'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_0925d787d946441bcb260301ed"`);
        await queryRunner.query(`DROP INDEX "IDX_ea8f234cac0aa04b9e7c62c5d7"`);
        await queryRunner.query(`DROP INDEX "IDX_4b043c0a4b7d22b49561ab5c5e"`);
        await queryRunner.query(`DROP INDEX "IDX_185fc5177219f0e7275361862c"`);
        await queryRunner.query(`DROP INDEX "IDX_c7ce474658b34fc55b81a336b1"`);
        await queryRunner.query(`DROP INDEX "IDX_e1d4ce012ab24f0c8653f9b224"`);
        await queryRunner.query(`DROP INDEX "IDX_0bdbaef6cb7cf6fd5049b239f1"`);
        await queryRunner.query(`DROP INDEX "IDX_6a0025590c2eb6b63c2a0bdb83"`);
        await queryRunner.query(`CREATE TABLE "temporary_run" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar(36) NOT NULL, "queueKey" varchar(64) NOT NULL DEFAULT ('default'), "clientRequestId" varchar(64) NOT NULL, "status" varchar(16) NOT NULL, "settingsProfileId" varchar(36), "settingsSnapshot" text NOT NULL, "promptProfileHash" varchar(128), "content" text NOT NULL DEFAULT (''), "stats" text, "error" text, "lockedBy" varchar(64), "lockedAt" datetime, "startedAt" datetime, "finishedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "sourceMessageId" varchar(36), "targetMessageId" varchar(36), "createdVariantId" varchar(36), "headMessageIdAtStart" varchar(36), CONSTRAINT "FK_6a0025590c2eb6b63c2a0bdb83f" FOREIGN KEY ("chatId") REFERENCES "chat" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_run"("id", "chatId", "queueKey", "clientRequestId", "status", "settingsProfileId", "settingsSnapshot", "promptProfileHash", "content", "stats", "error", "lockedBy", "lockedAt", "startedAt", "finishedAt", "createdAt", "updatedAt") SELECT "id", "chatId", "queueKey", "clientRequestId", "status", "settingsProfileId", "settingsSnapshot", "promptProfileHash", "content", "stats", "error", "lockedBy", "lockedAt", "startedAt", "finishedAt", "createdAt", "updatedAt" FROM "run"`);
        await queryRunner.query(`DROP TABLE "run"`);
        await queryRunner.query(`ALTER TABLE "temporary_run" RENAME TO "run"`);
        await queryRunner.query(`CREATE INDEX "IDX_0925d787d946441bcb260301ed" ON "run" ("queueKey", "status", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_ea8f234cac0aa04b9e7c62c5d7" ON "run" ("chatId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_4b043c0a4b7d22b49561ab5c5e" ON "run" ("status", "updatedAt") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_185fc5177219f0e7275361862c" ON "run" ("queueKey", "clientRequestId") `);
        await queryRunner.query(`CREATE INDEX "IDX_c7ce474658b34fc55b81a336b1" ON "run" ("lockedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_e1d4ce012ab24f0c8653f9b224" ON "run" ("lockedBy") `);
        await queryRunner.query(`CREATE INDEX "IDX_0bdbaef6cb7cf6fd5049b239f1" ON "run" ("settingsProfileId") `);
        await queryRunner.query(`CREATE INDEX "IDX_6a0025590c2eb6b63c2a0bdb83" ON "run" ("chatId") `);
        await queryRunner.query(`CREATE INDEX "IDX_e077be75b0a424042729928f76" ON "run" ("sourceMessageId") `);
        await queryRunner.query(`CREATE INDEX "IDX_87716c7ad6b05ecab7d6a1ab44" ON "run" ("targetMessageId") `);
        await queryRunner.query(`CREATE INDEX "IDX_17bbc34a7d9518800e3611da3f" ON "run" ("createdVariantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_95180899ce9bef275d89dbf2e5" ON "run" ("headMessageIdAtStart") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_95180899ce9bef275d89dbf2e5"`);
        await queryRunner.query(`DROP INDEX "IDX_17bbc34a7d9518800e3611da3f"`);
        await queryRunner.query(`DROP INDEX "IDX_87716c7ad6b05ecab7d6a1ab44"`);
        await queryRunner.query(`DROP INDEX "IDX_e077be75b0a424042729928f76"`);
        await queryRunner.query(`DROP INDEX "IDX_6a0025590c2eb6b63c2a0bdb83"`);
        await queryRunner.query(`DROP INDEX "IDX_0bdbaef6cb7cf6fd5049b239f1"`);
        await queryRunner.query(`DROP INDEX "IDX_e1d4ce012ab24f0c8653f9b224"`);
        await queryRunner.query(`DROP INDEX "IDX_c7ce474658b34fc55b81a336b1"`);
        await queryRunner.query(`DROP INDEX "IDX_185fc5177219f0e7275361862c"`);
        await queryRunner.query(`DROP INDEX "IDX_4b043c0a4b7d22b49561ab5c5e"`);
        await queryRunner.query(`DROP INDEX "IDX_ea8f234cac0aa04b9e7c62c5d7"`);
        await queryRunner.query(`DROP INDEX "IDX_0925d787d946441bcb260301ed"`);
        await queryRunner.query(`ALTER TABLE "run" RENAME TO "temporary_run"`);
        await queryRunner.query(`CREATE TABLE "run" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar(36) NOT NULL, "queueKey" varchar(64) NOT NULL DEFAULT ('default'), "clientRequestId" varchar(64) NOT NULL, "status" varchar(16) NOT NULL, "settingsProfileId" varchar(36), "settingsSnapshot" text NOT NULL, "promptProfileHash" varchar(128), "content" text NOT NULL DEFAULT (''), "stats" text, "error" text, "lockedBy" varchar(64), "lockedAt" datetime, "startedAt" datetime, "finishedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_6a0025590c2eb6b63c2a0bdb83f" FOREIGN KEY ("chatId") REFERENCES "chat" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "run"("id", "chatId", "queueKey", "clientRequestId", "status", "settingsProfileId", "settingsSnapshot", "promptProfileHash", "content", "stats", "error", "lockedBy", "lockedAt", "startedAt", "finishedAt", "createdAt", "updatedAt") SELECT "id", "chatId", "queueKey", "clientRequestId", "status", "settingsProfileId", "settingsSnapshot", "promptProfileHash", "content", "stats", "error", "lockedBy", "lockedAt", "startedAt", "finishedAt", "createdAt", "updatedAt" FROM "temporary_run"`);
        await queryRunner.query(`DROP TABLE "temporary_run"`);
        await queryRunner.query(`CREATE INDEX "IDX_6a0025590c2eb6b63c2a0bdb83" ON "run" ("chatId") `);
        await queryRunner.query(`CREATE INDEX "IDX_0bdbaef6cb7cf6fd5049b239f1" ON "run" ("settingsProfileId") `);
        await queryRunner.query(`CREATE INDEX "IDX_e1d4ce012ab24f0c8653f9b224" ON "run" ("lockedBy") `);
        await queryRunner.query(`CREATE INDEX "IDX_c7ce474658b34fc55b81a336b1" ON "run" ("lockedAt") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_185fc5177219f0e7275361862c" ON "run" ("queueKey", "clientRequestId") `);
        await queryRunner.query(`CREATE INDEX "IDX_4b043c0a4b7d22b49561ab5c5e" ON "run" ("status", "updatedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_ea8f234cac0aa04b9e7c62c5d7" ON "run" ("chatId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_0925d787d946441bcb260301ed" ON "run" ("queueKey", "status", "createdAt") `);
    }

}
