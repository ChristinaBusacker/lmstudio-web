import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1768648450866 implements MigrationInterface {
    name = 'AutoMigration1768648450866'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "chat_folder" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar(120) NOT NULL, "parentId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_4225f42acb67f55eb1fa8da673" ON "chat_folder" ("name") `);
        await queryRunner.query(`CREATE INDEX "IDX_f40ae5e945c33599ee6f5334e5" ON "chat_folder" ("parentId") `);
        await queryRunner.query(`CREATE TABLE "message_variant" ("id" varchar PRIMARY KEY NOT NULL, "messageId" varchar(36) NOT NULL, "variantIndex" integer NOT NULL, "isActive" boolean NOT NULL DEFAULT (0), "content" text NOT NULL, "reasoning" text, "stats" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_9a14a432495b500781007b4f4a" ON "message_variant" ("messageId") `);
        await queryRunner.query(`CREATE INDEX "IDX_71d64bd98498c69333adb2ee7e" ON "message_variant" ("messageId", "isActive") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_88da9d1d5c8372563c5c999403" ON "message_variant" ("messageId", "variantIndex") `);
        await queryRunner.query(`DROP INDEX "IDX_93a28d680f3f131dea7415e0bf"`);
        await queryRunner.query(`DROP INDEX "IDX_f7fe6d097dd261b8db465fd318"`);
        await queryRunner.query(`DROP INDEX "IDX_619bc7b78eba833d2044153bac"`);
        await queryRunner.query(`CREATE TABLE "temporary_message" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar(36) NOT NULL, "role" varchar(16) NOT NULL, "content" text NOT NULL, "reasoning" text, "runId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "parentMessageId" varchar(36), "deletedAt" datetime, "editedAt" datetime, CONSTRAINT "FK_619bc7b78eba833d2044153bacc" FOREIGN KEY ("chatId") REFERENCES "chat" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_message"("id", "chatId", "role", "content", "reasoning", "runId", "createdAt") SELECT "id", "chatId", "role", "content", "reasoning", "runId", "createdAt" FROM "message"`);
        await queryRunner.query(`DROP TABLE "message"`);
        await queryRunner.query(`ALTER TABLE "temporary_message" RENAME TO "message"`);
        await queryRunner.query(`CREATE INDEX "IDX_93a28d680f3f131dea7415e0bf" ON "message" ("chatId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_f7fe6d097dd261b8db465fd318" ON "message" ("runId") `);
        await queryRunner.query(`CREATE INDEX "IDX_619bc7b78eba833d2044153bac" ON "message" ("chatId") `);
        await queryRunner.query(`DROP INDEX "IDX_735274924ad41f45b7688ce71b"`);
        await queryRunner.query(`CREATE TABLE "temporary_chat" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar(200), "defaultSettingsProfileId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "folderId" varchar(36), "activeHeadMessageId" varchar(36), "deletedAt" datetime)`);
        await queryRunner.query(`INSERT INTO "temporary_chat"("id", "title", "defaultSettingsProfileId", "createdAt", "updatedAt") SELECT "id", "title", "defaultSettingsProfileId", "createdAt", "updatedAt" FROM "chat"`);
        await queryRunner.query(`DROP TABLE "chat"`);
        await queryRunner.query(`ALTER TABLE "temporary_chat" RENAME TO "chat"`);
        await queryRunner.query(`CREATE INDEX "IDX_735274924ad41f45b7688ce71b" ON "chat" ("defaultSettingsProfileId") `);
        await queryRunner.query(`CREATE INDEX "IDX_575b24e003b8881e64fa53cd16" ON "message" ("parentMessageId") `);
        await queryRunner.query(`CREATE INDEX "IDX_8404c0b69a7fdef1cf9d150e36" ON "message" ("deletedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_2ff802821ec18bdaf22c441dac" ON "message" ("editedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_962e4ff1dcfc39f879a84b1575" ON "chat" ("folderId") `);
        await queryRunner.query(`CREATE INDEX "IDX_3bfd93786ef7f820ff8adf4074" ON "chat" ("activeHeadMessageId") `);
        await queryRunner.query(`CREATE INDEX "IDX_517679f4b7af9aef6f00d6bcc7" ON "chat" ("deletedAt") `);
        await queryRunner.query(`DROP INDEX "IDX_735274924ad41f45b7688ce71b"`);
        await queryRunner.query(`DROP INDEX "IDX_962e4ff1dcfc39f879a84b1575"`);
        await queryRunner.query(`DROP INDEX "IDX_3bfd93786ef7f820ff8adf4074"`);
        await queryRunner.query(`DROP INDEX "IDX_517679f4b7af9aef6f00d6bcc7"`);
        await queryRunner.query(`CREATE TABLE "temporary_chat" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar(200), "defaultSettingsProfileId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "folderId" varchar(36), "activeHeadMessageId" varchar(36), "deletedAt" datetime, CONSTRAINT "FK_962e4ff1dcfc39f879a84b15756" FOREIGN KEY ("folderId") REFERENCES "chat_folder" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_chat"("id", "title", "defaultSettingsProfileId", "createdAt", "updatedAt", "folderId", "activeHeadMessageId", "deletedAt") SELECT "id", "title", "defaultSettingsProfileId", "createdAt", "updatedAt", "folderId", "activeHeadMessageId", "deletedAt" FROM "chat"`);
        await queryRunner.query(`DROP TABLE "chat"`);
        await queryRunner.query(`ALTER TABLE "temporary_chat" RENAME TO "chat"`);
        await queryRunner.query(`CREATE INDEX "IDX_735274924ad41f45b7688ce71b" ON "chat" ("defaultSettingsProfileId") `);
        await queryRunner.query(`CREATE INDEX "IDX_962e4ff1dcfc39f879a84b1575" ON "chat" ("folderId") `);
        await queryRunner.query(`CREATE INDEX "IDX_3bfd93786ef7f820ff8adf4074" ON "chat" ("activeHeadMessageId") `);
        await queryRunner.query(`CREATE INDEX "IDX_517679f4b7af9aef6f00d6bcc7" ON "chat" ("deletedAt") `);
        await queryRunner.query(`DROP INDEX "IDX_9a14a432495b500781007b4f4a"`);
        await queryRunner.query(`DROP INDEX "IDX_71d64bd98498c69333adb2ee7e"`);
        await queryRunner.query(`DROP INDEX "IDX_88da9d1d5c8372563c5c999403"`);
        await queryRunner.query(`CREATE TABLE "temporary_message_variant" ("id" varchar PRIMARY KEY NOT NULL, "messageId" varchar(36) NOT NULL, "variantIndex" integer NOT NULL, "isActive" boolean NOT NULL DEFAULT (0), "content" text NOT NULL, "reasoning" text, "stats" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_9a14a432495b500781007b4f4a1" FOREIGN KEY ("messageId") REFERENCES "message" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_message_variant"("id", "messageId", "variantIndex", "isActive", "content", "reasoning", "stats", "createdAt") SELECT "id", "messageId", "variantIndex", "isActive", "content", "reasoning", "stats", "createdAt" FROM "message_variant"`);
        await queryRunner.query(`DROP TABLE "message_variant"`);
        await queryRunner.query(`ALTER TABLE "temporary_message_variant" RENAME TO "message_variant"`);
        await queryRunner.query(`CREATE INDEX "IDX_9a14a432495b500781007b4f4a" ON "message_variant" ("messageId") `);
        await queryRunner.query(`CREATE INDEX "IDX_71d64bd98498c69333adb2ee7e" ON "message_variant" ("messageId", "isActive") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_88da9d1d5c8372563c5c999403" ON "message_variant" ("messageId", "variantIndex") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_88da9d1d5c8372563c5c999403"`);
        await queryRunner.query(`DROP INDEX "IDX_71d64bd98498c69333adb2ee7e"`);
        await queryRunner.query(`DROP INDEX "IDX_9a14a432495b500781007b4f4a"`);
        await queryRunner.query(`ALTER TABLE "message_variant" RENAME TO "temporary_message_variant"`);
        await queryRunner.query(`CREATE TABLE "message_variant" ("id" varchar PRIMARY KEY NOT NULL, "messageId" varchar(36) NOT NULL, "variantIndex" integer NOT NULL, "isActive" boolean NOT NULL DEFAULT (0), "content" text NOT NULL, "reasoning" text, "stats" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "message_variant"("id", "messageId", "variantIndex", "isActive", "content", "reasoning", "stats", "createdAt") SELECT "id", "messageId", "variantIndex", "isActive", "content", "reasoning", "stats", "createdAt" FROM "temporary_message_variant"`);
        await queryRunner.query(`DROP TABLE "temporary_message_variant"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_88da9d1d5c8372563c5c999403" ON "message_variant" ("messageId", "variantIndex") `);
        await queryRunner.query(`CREATE INDEX "IDX_71d64bd98498c69333adb2ee7e" ON "message_variant" ("messageId", "isActive") `);
        await queryRunner.query(`CREATE INDEX "IDX_9a14a432495b500781007b4f4a" ON "message_variant" ("messageId") `);
        await queryRunner.query(`DROP INDEX "IDX_517679f4b7af9aef6f00d6bcc7"`);
        await queryRunner.query(`DROP INDEX "IDX_3bfd93786ef7f820ff8adf4074"`);
        await queryRunner.query(`DROP INDEX "IDX_962e4ff1dcfc39f879a84b1575"`);
        await queryRunner.query(`DROP INDEX "IDX_735274924ad41f45b7688ce71b"`);
        await queryRunner.query(`ALTER TABLE "chat" RENAME TO "temporary_chat"`);
        await queryRunner.query(`CREATE TABLE "chat" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar(200), "defaultSettingsProfileId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "folderId" varchar(36), "activeHeadMessageId" varchar(36), "deletedAt" datetime)`);
        await queryRunner.query(`INSERT INTO "chat"("id", "title", "defaultSettingsProfileId", "createdAt", "updatedAt", "folderId", "activeHeadMessageId", "deletedAt") SELECT "id", "title", "defaultSettingsProfileId", "createdAt", "updatedAt", "folderId", "activeHeadMessageId", "deletedAt" FROM "temporary_chat"`);
        await queryRunner.query(`DROP TABLE "temporary_chat"`);
        await queryRunner.query(`CREATE INDEX "IDX_517679f4b7af9aef6f00d6bcc7" ON "chat" ("deletedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_3bfd93786ef7f820ff8adf4074" ON "chat" ("activeHeadMessageId") `);
        await queryRunner.query(`CREATE INDEX "IDX_962e4ff1dcfc39f879a84b1575" ON "chat" ("folderId") `);
        await queryRunner.query(`CREATE INDEX "IDX_735274924ad41f45b7688ce71b" ON "chat" ("defaultSettingsProfileId") `);
        await queryRunner.query(`DROP INDEX "IDX_517679f4b7af9aef6f00d6bcc7"`);
        await queryRunner.query(`DROP INDEX "IDX_3bfd93786ef7f820ff8adf4074"`);
        await queryRunner.query(`DROP INDEX "IDX_962e4ff1dcfc39f879a84b1575"`);
        await queryRunner.query(`DROP INDEX "IDX_2ff802821ec18bdaf22c441dac"`);
        await queryRunner.query(`DROP INDEX "IDX_8404c0b69a7fdef1cf9d150e36"`);
        await queryRunner.query(`DROP INDEX "IDX_575b24e003b8881e64fa53cd16"`);
        await queryRunner.query(`DROP INDEX "IDX_735274924ad41f45b7688ce71b"`);
        await queryRunner.query(`ALTER TABLE "chat" RENAME TO "temporary_chat"`);
        await queryRunner.query(`CREATE TABLE "chat" ("id" varchar PRIMARY KEY NOT NULL, "title" varchar(200), "defaultSettingsProfileId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "chat"("id", "title", "defaultSettingsProfileId", "createdAt", "updatedAt") SELECT "id", "title", "defaultSettingsProfileId", "createdAt", "updatedAt" FROM "temporary_chat"`);
        await queryRunner.query(`DROP TABLE "temporary_chat"`);
        await queryRunner.query(`CREATE INDEX "IDX_735274924ad41f45b7688ce71b" ON "chat" ("defaultSettingsProfileId") `);
        await queryRunner.query(`DROP INDEX "IDX_619bc7b78eba833d2044153bac"`);
        await queryRunner.query(`DROP INDEX "IDX_f7fe6d097dd261b8db465fd318"`);
        await queryRunner.query(`DROP INDEX "IDX_93a28d680f3f131dea7415e0bf"`);
        await queryRunner.query(`ALTER TABLE "message" RENAME TO "temporary_message"`);
        await queryRunner.query(`CREATE TABLE "message" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar(36) NOT NULL, "role" varchar(16) NOT NULL, "content" text NOT NULL, "reasoning" text, "runId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_619bc7b78eba833d2044153bacc" FOREIGN KEY ("chatId") REFERENCES "chat" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "message"("id", "chatId", "role", "content", "reasoning", "runId", "createdAt") SELECT "id", "chatId", "role", "content", "reasoning", "runId", "createdAt" FROM "temporary_message"`);
        await queryRunner.query(`DROP TABLE "temporary_message"`);
        await queryRunner.query(`CREATE INDEX "IDX_619bc7b78eba833d2044153bac" ON "message" ("chatId") `);
        await queryRunner.query(`CREATE INDEX "IDX_f7fe6d097dd261b8db465fd318" ON "message" ("runId") `);
        await queryRunner.query(`CREATE INDEX "IDX_93a28d680f3f131dea7415e0bf" ON "message" ("chatId", "createdAt") `);
        await queryRunner.query(`DROP INDEX "IDX_88da9d1d5c8372563c5c999403"`);
        await queryRunner.query(`DROP INDEX "IDX_71d64bd98498c69333adb2ee7e"`);
        await queryRunner.query(`DROP INDEX "IDX_9a14a432495b500781007b4f4a"`);
        await queryRunner.query(`DROP TABLE "message_variant"`);
        await queryRunner.query(`DROP INDEX "IDX_f40ae5e945c33599ee6f5334e5"`);
        await queryRunner.query(`DROP INDEX "IDX_4225f42acb67f55eb1fa8da673"`);
        await queryRunner.query(`DROP TABLE "chat_folder"`);
    }

}
