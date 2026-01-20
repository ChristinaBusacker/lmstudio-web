import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1768904037978 implements MigrationInterface {
    name = 'AutoMigration1768904037978'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_f40ae5e945c33599ee6f5334e5"`);
        await queryRunner.query(`DROP INDEX "IDX_4225f42acb67f55eb1fa8da673"`);
        await queryRunner.query(`CREATE TABLE "temporary_chat_folder" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar(120) NOT NULL, "parentId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "deletedAt" datetime)`);
        await queryRunner.query(`INSERT INTO "temporary_chat_folder"("id", "name", "parentId", "createdAt", "updatedAt") SELECT "id", "name", "parentId", "createdAt", "updatedAt" FROM "chat_folder"`);
        await queryRunner.query(`DROP TABLE "chat_folder"`);
        await queryRunner.query(`ALTER TABLE "temporary_chat_folder" RENAME TO "chat_folder"`);
        await queryRunner.query(`CREATE INDEX "IDX_f40ae5e945c33599ee6f5334e5" ON "chat_folder" ("parentId") `);
        await queryRunner.query(`CREATE INDEX "IDX_4225f42acb67f55eb1fa8da673" ON "chat_folder" ("name") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_4225f42acb67f55eb1fa8da673"`);
        await queryRunner.query(`DROP INDEX "IDX_f40ae5e945c33599ee6f5334e5"`);
        await queryRunner.query(`ALTER TABLE "chat_folder" RENAME TO "temporary_chat_folder"`);
        await queryRunner.query(`CREATE TABLE "chat_folder" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar(120) NOT NULL, "parentId" varchar(36), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "chat_folder"("id", "name", "parentId", "createdAt", "updatedAt") SELECT "id", "name", "parentId", "createdAt", "updatedAt" FROM "temporary_chat_folder"`);
        await queryRunner.query(`DROP TABLE "temporary_chat_folder"`);
        await queryRunner.query(`CREATE INDEX "IDX_4225f42acb67f55eb1fa8da673" ON "chat_folder" ("name") `);
        await queryRunner.query(`CREATE INDEX "IDX_f40ae5e945c33599ee6f5334e5" ON "chat_folder" ("parentId") `);
    }

}
