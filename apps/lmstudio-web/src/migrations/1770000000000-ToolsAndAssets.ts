import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds:
 * - asset: uploaded files stored on disk
 * - run_artifact: tool/run scoped artifacts for chat runs
 */
export class ToolsAndAssets1770000000000 implements MigrationInterface {
  name = 'ToolsAndAssets1770000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "asset" (
        "id" varchar PRIMARY KEY NOT NULL,
        "originalFilename" varchar(240) NOT NULL,
        "mimeType" varchar(160),
        "sizeBytes" integer NOT NULL,
        "sha256" varchar(64) NOT NULL,
        "path" varchar(500) NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_asset_sha256" ON "asset" ("sha256")`);

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "run_artifact" (
        "id" varchar PRIMARY KEY NOT NULL,
        "runId" varchar(36) NOT NULL,
        "toolName" varchar(80),
        "kind" varchar(16) NOT NULL,
        "mimeType" varchar(120),
        "filename" varchar(200),
        "contentText" text,
        "contentJson" text,
        "blobPath" varchar(500),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_run_artifact_runId" ON "run_artifact" ("runId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "run_artifact"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "asset"`);
  }
}
