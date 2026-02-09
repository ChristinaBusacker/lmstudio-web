import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateWorkflowRunDto } from './dto/create-workflow-run.dto';
import { WorkflowsService } from './workflows.service';
import { ImportWorkflowBundleDto } from './dto/import-workflow-bundle.dto';

@ApiTags('Workflows')
@Controller('workflows')
export class WorkflowsController {
  private readonly ownerKey = 'default';

  constructor(private readonly workflows: WorkflowsService) {}

  @Post()
  @ApiOperation({ summary: 'Create workflow (Blueprint)' })
  createWorkflow(@Body() dto: CreateWorkflowDto) {
    return this.workflows.create(this.ownerKey, dto);
  }

  @Get('workflow-runs')
  @ApiOperation({ summary: 'List workflow runs' })
  listRuns(
    @Query('workflowId') workflowId?: string,
    @Query('status') status?: any,
    @Query('limit') limit?: any,
  ) {
    return this.workflows.listRuns(this.ownerKey, {
      workflowId,
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('workflow-runs/:runId')
  @ApiOperation({ summary: 'Get run details (run + node runs + artifacts)' })
  getRun(@Param('runId') runId: string) {
    return this.workflows.getRun(this.ownerKey, runId);
  }

  @Get('artifacts/:artifactId/download')
  @ApiOperation({ summary: 'Download an artifact as a file' })
  async downloadArtifact(@Param('artifactId') artifactId: string, @Res() res: Response) {
    const a = await this.workflows.getArtifact(this.ownerKey, artifactId);

    const filename = (a.filename ?? `artifact-${a.id}`).replace(/\r|\n/g, ' ').trim();
    const mime = a.mimeType ?? this.defaultMime(a.kind);

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (a.blobPath) {
      try {
        await stat(a.blobPath);
        return createReadStream(a.blobPath).pipe(res);
      } catch {
        // fall through to in-db content
      }
    }

    if (a.kind === 'json') {
      const json = a.contentJson ?? (a.contentText ? safeParseJson(a.contentText) : null);
      const body = JSON.stringify(json ?? null, null, 2);
      return res.send(body);
    }

    if (a.contentText !== null && a.contentText !== undefined) {
      return res.send(a.contentText);
    }

    return res.status(404).send('Artifact content not available');
  }

  @Post('workflow-runs/:runId/rerun-from/:nodeId')
  @ApiOperation({ summary: 'Rerun from node (invalidate downstream)' })
  rerunFrom(@Param('runId') runId: string, @Param('nodeId') nodeId: string) {
    return this.workflows.rerunFrom(this.ownerKey, runId, nodeId);
  }

  @Get()
  @ApiOperation({ summary: 'List workflows' })
  listWorkflows() {
    return this.workflows.list(this.ownerKey);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow by id' })
  getWorkflow(@Param('id') id: string) {
    return this.workflows.get(this.ownerKey, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Get workflow by id' })
  deleteWorkflow(@Param('id') id: string) {
    return this.workflows.delete(this.ownerKey, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update workflow' })
  updateWorkflow(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflows.update(this.ownerKey, id, dto);
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Export workflow (optionally including runs + artifacts)' })
  async exportWorkflow(
    @Param('id') workflowId: string,
    @Query('includeRuns') includeRunsRaw: string | undefined,
    @Query('limitRuns') limitRunsRaw: string | undefined,
    @Res() res: Response,
  ) {
    const includeRuns = includeRunsRaw === '1' || includeRunsRaw === 'true';
    const limitRuns = limitRunsRaw ? Number(limitRunsRaw) : 50;

    const bundle = await this.workflows.exportWorkflowBundle(this.ownerKey, workflowId, {
      includeRuns,
      limitRuns,
    });

    const wfName = (bundle.workflow.name ?? `workflow-${workflowId}`).replace(/[^\w\-]+/g, '_');
    const filename = includeRuns ? `${wfName}.with-runs.json` : `${wfName}.json`;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(JSON.stringify(bundle, null, 2));
  }

  @Post(':id/runs')
  @ApiOperation({ summary: 'Start workflow run (server-side execution)' })
  startRun(@Param('id') workflowId: string, @Body() dto: CreateWorkflowRunDto) {
    return this.workflows.createRun(this.ownerKey, workflowId, dto);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import workflow bundle as a new workflow' })
  importWorkflow(@Body() dto: ImportWorkflowBundleDto) {
    return this.workflows.importWorkflowBundle(this.ownerKey, {
      bundle: dto.bundle,
      name: dto.name,
    });
  }

  private defaultMime(kind: string): string {
    switch (kind) {
      case 'json':
        return 'application/json; charset=utf-8';
      case 'text':
        return 'text/plain; charset=utf-8';
      case 'image':
        return 'image/png';
      case 'binary':
        return 'application/octet-stream';
      default:
        return 'application/octet-stream';
    }
  }
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
