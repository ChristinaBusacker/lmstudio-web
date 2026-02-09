import { MigrationInterface, QueryRunner } from "typeorm";

export class AutoMigration1770594703794 implements MigrationInterface {
    name = 'AutoMigration1770594703794'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_eb3ee88ba65d8f291292c0bb42"`);
        await queryRunner.query(`DROP INDEX "IDX_43ceb61691b1826acb57071b18"`);
        await queryRunner.query(`DROP INDEX "IDX_d56c6ff01ff288928a5e404a7f"`);
        await queryRunner.query(`CREATE TABLE "temporary_workflow_node_run" ("id" varchar PRIMARY KEY NOT NULL, "workflowRunId" varchar NOT NULL, "nodeId" varchar(128) NOT NULL, "status" varchar(16) NOT NULL, "inputSnapshot" text, "outputText" text, "outputJson" text, "primaryArtifactId" varchar, "error" text, "startedAt" datetime, "finishedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "iteration" integer NOT NULL DEFAULT (0))`);
        await queryRunner.query(`INSERT INTO "temporary_workflow_node_run"("id", "workflowRunId", "nodeId", "status", "inputSnapshot", "outputText", "outputJson", "primaryArtifactId", "error", "startedAt", "finishedAt", "createdAt") SELECT "id", "workflowRunId", "nodeId", "status", "inputSnapshot", "outputText", "outputJson", "primaryArtifactId", "error", "startedAt", "finishedAt", "createdAt" FROM "workflow_node_run"`);
        await queryRunner.query(`DROP TABLE "workflow_node_run"`);
        await queryRunner.query(`ALTER TABLE "temporary_workflow_node_run" RENAME TO "workflow_node_run"`);
        await queryRunner.query(`CREATE INDEX "IDX_43ceb61691b1826acb57071b18" ON "workflow_node_run" ("workflowRunId") `);
        await queryRunner.query(`CREATE INDEX "IDX_d56c6ff01ff288928a5e404a7f" ON "workflow_node_run" ("status") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6a05084531188fd5bda926b6c4" ON "workflow_node_run" ("workflowRunId", "nodeId", "iteration") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_6a05084531188fd5bda926b6c4"`);
        await queryRunner.query(`DROP INDEX "IDX_d56c6ff01ff288928a5e404a7f"`);
        await queryRunner.query(`DROP INDEX "IDX_43ceb61691b1826acb57071b18"`);
        await queryRunner.query(`ALTER TABLE "workflow_node_run" RENAME TO "temporary_workflow_node_run"`);
        await queryRunner.query(`CREATE TABLE "workflow_node_run" ("id" varchar PRIMARY KEY NOT NULL, "workflowRunId" varchar NOT NULL, "nodeId" varchar(128) NOT NULL, "status" varchar(16) NOT NULL, "inputSnapshot" text, "outputText" text, "outputJson" text, "primaryArtifactId" varchar, "error" text, "startedAt" datetime, "finishedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "workflow_node_run"("id", "workflowRunId", "nodeId", "status", "inputSnapshot", "outputText", "outputJson", "primaryArtifactId", "error", "startedAt", "finishedAt", "createdAt") SELECT "id", "workflowRunId", "nodeId", "status", "inputSnapshot", "outputText", "outputJson", "primaryArtifactId", "error", "startedAt", "finishedAt", "createdAt" FROM "temporary_workflow_node_run"`);
        await queryRunner.query(`DROP TABLE "temporary_workflow_node_run"`);
        await queryRunner.query(`CREATE INDEX "IDX_d56c6ff01ff288928a5e404a7f" ON "workflow_node_run" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_43ceb61691b1826acb57071b18" ON "workflow_node_run" ("workflowRunId") `);
        await queryRunner.query(`CREATE INDEX "IDX_eb3ee88ba65d8f291292c0bb42" ON "workflow_node_run" ("workflowRunId", "nodeId") `);
    }

}
