import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1768658075879 implements MigrationInterface {
    name = 'AutoMigration1768658075879'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_f7fe6d097dd261b8db465fd318"`);
        await queryRunner.query(`DROP INDEX "IDX_2ff802821ec18bdaf22c441dac"`);
        await queryRunner.query(`DROP INDEX "IDX_8404c0b69a7fdef1cf9d150e36"`);
        await queryRunner.query(`DROP INDEX "IDX_575b24e003b8881e64fa53cd16"`);
        await queryRunner.query(`DROP INDEX "IDX_619bc7b78eba833d2044153bac"`);
        await queryRunner.query(`DROP INDEX "IDX_93a28d680f3f131dea7415e0bf"`);
        await queryRunner.query(`CREATE TABLE "temporary_message" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar(36) NOT NULL, "role" varchar(16) NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "parentMessageId" varchar(36), "deletedAt" datetime, "editedAt" datetime, CONSTRAINT "FK_619bc7b78eba833d2044153bacc" FOREIGN KEY ("chatId") REFERENCES "chat" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_message"("id", "chatId", "role", "createdAt", "parentMessageId", "deletedAt", "editedAt") SELECT "id", "chatId", "role", "createdAt", "parentMessageId", "deletedAt", "editedAt" FROM "message"`);
        await queryRunner.query(`DROP TABLE "message"`);
        await queryRunner.query(`ALTER TABLE "temporary_message" RENAME TO "message"`);
        await queryRunner.query(`CREATE INDEX "IDX_2ff802821ec18bdaf22c441dac" ON "message" ("editedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_8404c0b69a7fdef1cf9d150e36" ON "message" ("deletedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_575b24e003b8881e64fa53cd16" ON "message" ("parentMessageId") `);
        await queryRunner.query(`CREATE INDEX "IDX_619bc7b78eba833d2044153bac" ON "message" ("chatId") `);
        await queryRunner.query(`CREATE INDEX "IDX_93a28d680f3f131dea7415e0bf" ON "message" ("chatId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_f608ad12bd6f3870d84bbfc080" ON "message" ("chatId", "parentMessageId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_f608ad12bd6f3870d84bbfc080"`);
        await queryRunner.query(`DROP INDEX "IDX_93a28d680f3f131dea7415e0bf"`);
        await queryRunner.query(`DROP INDEX "IDX_619bc7b78eba833d2044153bac"`);
        await queryRunner.query(`DROP INDEX "IDX_575b24e003b8881e64fa53cd16"`);
        await queryRunner.query(`DROP INDEX "IDX_8404c0b69a7fdef1cf9d150e36"`);
        await queryRunner.query(`DROP INDEX "IDX_2ff802821ec18bdaf22c441dac"`);
        await queryRunner.query(`ALTER TABLE "message" RENAME TO "temporary_message"`);
        await queryRunner.query(`CREATE TABLE "message" ("id" varchar PRIMARY KEY NOT NULL, "chatId" varchar(36) NOT NULL, "role" varchar(16) NOT NULL, "content" text NOT NULL, "reasoning" text, "runId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "parentMessageId" varchar(36), "deletedAt" datetime, "editedAt" datetime, CONSTRAINT "FK_619bc7b78eba833d2044153bacc" FOREIGN KEY ("chatId") REFERENCES "chat" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "message"("id", "chatId", "role", "createdAt", "parentMessageId", "deletedAt", "editedAt") SELECT "id", "chatId", "role", "createdAt", "parentMessageId", "deletedAt", "editedAt" FROM "temporary_message"`);
        await queryRunner.query(`DROP TABLE "temporary_message"`);
        await queryRunner.query(`CREATE INDEX "IDX_93a28d680f3f131dea7415e0bf" ON "message" ("chatId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_619bc7b78eba833d2044153bac" ON "message" ("chatId") `);
        await queryRunner.query(`CREATE INDEX "IDX_575b24e003b8881e64fa53cd16" ON "message" ("parentMessageId") `);
        await queryRunner.query(`CREATE INDEX "IDX_8404c0b69a7fdef1cf9d150e36" ON "message" ("deletedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_2ff802821ec18bdaf22c441dac" ON "message" ("editedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_f7fe6d097dd261b8db465fd318" ON "message" ("runId") `);
    }

}
