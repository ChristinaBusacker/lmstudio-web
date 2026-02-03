import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateWorkflowRunDto } from './dto/create-workflow-run.dto';
import { WorkflowsService } from './workflows.service';

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

  @Patch(':id')
  @ApiOperation({ summary: 'Update workflow' })
  updateWorkflow(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflows.update(this.ownerKey, id, dto);
  }

  @Post(':id/runs')
  @ApiOperation({ summary: 'Start workflow run (server-side execution)' })
  startRun(@Param('id') workflowId: string, @Body() dto: CreateWorkflowRunDto) {
    return this.workflows.createRun(this.ownerKey, workflowId, dto);
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

  @Post('workflow-runs/:runId/rerun-from/:nodeId')
  @ApiOperation({ summary: 'Rerun from node (invalidate downstream)' })
  rerunFrom(@Param('runId') runId: string, @Param('nodeId') nodeId: string) {
    return this.workflows.rerunFrom(this.ownerKey, runId, nodeId);
  }
}
