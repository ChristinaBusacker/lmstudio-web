/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RunsService } from './runs.service';
import { RunStatusDto } from './dto/run-status.dto';
import { ListRunsQueryDto } from './dto/list-runs.query.dto';
import { ListActiveRunsQueryDto } from './dto/active-runs.dto';
import { ChatEngineService } from '../chats/chat-engine.service';
import { CancelRunResponseDto } from './dto/cancel-run-response.dto';

@ApiTags('Runs')
@Controller()
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly engine: ChatEngineService,
  ) {}

  @Get('runs/:runId')
  @ApiOperation({ summary: 'Get run status by id' })
  @ApiParam({ name: 'runId', description: 'Run id' })
  @ApiOkResponse({ type: RunStatusDto })
  @ApiNotFoundResponse({ description: 'Run not found' })
  async getById(@Param('runId') runId: string): Promise<RunStatusDto> {
    const run = await this.runs.getById(runId);
    if (!run) throw new NotFoundException('Run not found');
    return this.toDto(run);
  }

  @Get('chats/:chatId/runs')
  @ApiOperation({ summary: 'List recent runs for a chat' })
  @ApiParam({ name: 'chatId', description: 'Chat id' })
  @ApiOkResponse({ type: [RunStatusDto] })
  async listByChat(
    @Param('chatId') chatId: string,
    @Query() query: ListRunsQueryDto,
  ): Promise<RunStatusDto[]> {
    const limit = query.limit ?? 20;
    const list = await this.runs.listByChat(chatId, limit);
    return list.map((r) => this.toDto(r));
  }

  @Get('runs/active')
  @ApiOperation({
    summary: 'List active runs (queued + running)',
    description: 'Useful for a UI queue view. Ordered by status (queued first) and createdAt.',
  })
  @ApiOkResponse({ type: [RunStatusDto] })
  async listActive(@Query() query: ListActiveRunsQueryDto): Promise<RunStatusDto[]> {
    const list = await this.runs.listActive({
      queueKey: query.queueKey ?? 'default',
      limit: query.limit ?? 50,
    });

    // Stable ordering for UI regardless of DB ordering semantics
    const priority: Record<string, number> = {
      queued: 0,
      running: 1,
      completed: 2,
      failed: 3,
      canceled: 4,
    };
    list.sort((a: any, b: any) => {
      const pa = priority[a.status] ?? 99;
      const pb = priority[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      const ca =
        a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const cb =
        b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return ca - cb;
    });

    return list.map((r) => this.toDto(r));
  }

  @Get('chats/:chatId/runs/active')
  @ApiOperation({ summary: 'List active runs for a chat (queued + running)' })
  @ApiParam({ name: 'chatId', description: 'Chat id' })
  @ApiOkResponse({ type: [RunStatusDto] })
  async listActiveByChat(
    @Param('chatId') chatId: string,
    @Query() query: ListActiveRunsQueryDto,
  ): Promise<RunStatusDto[]> {
    const list = await this.runs.listActiveByChat(chatId, {
      queueKey: query.queueKey ?? 'default',
      limit: query.limit ?? 50,
    });

    const priority: Record<string, number> = {
      queued: 0,
      running: 1,
      completed: 2,
      failed: 3,
      canceled: 4,
    };
    list.sort((a: any, b: any) => {
      const pa = priority[a.status] ?? 99;
      const pb = priority[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      const ca =
        a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
      const cb =
        b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
      return ca - cb;
    });

    return list.map((r) => this.toDto(r));
  }

  private toDto(r: any): RunStatusDto {
    const toIso = (d: any) => (d instanceof Date ? d.toISOString() : d ? String(d) : null);

    return {
      id: String(r.id),
      chatId: String(r.chatId),
      queueKey: String(r.queueKey ?? 'default'),
      status: r.status,
      clientRequestId: r.clientRequestId ?? null,
      settingsProfileId: r.settingsProfileId ?? null,
      settingsSnapshot: (r.settingsSnapshot ?? {}) as Record<string, any>,
      sourceMessageId: r.sourceMessageId ?? null,
      targetMessageId: r.targetMessageId ?? null,
      headMessageIdAtStart: r.headMessageIdAtStart ?? null,
      lockedBy: r.lockedBy ?? null,
      lockedAt: toIso(r.lockedAt),
      startedAt: toIso(r.startedAt),
      finishedAt: toIso(r.finishedAt),
      error: r.error ?? null,
      stats: r.stats ?? null,
      createdVariantId: r.createdVariantId ?? null,
      createdAt: toIso(r.createdAt) ?? new Date().toISOString(),
      updatedAt: toIso(r.updatedAt) ?? new Date().toISOString(),
    };
  }

  @Post('runs/:runId/cancel')
  @ApiOperation({
    summary: 'Cancel a run (best-effort)',
    description:
      'Attempts to abort the LM Studio stream for this run and marks it as canceled. ' +
      'If the run already finished, it returns the unchanged status.',
  })
  @ApiParam({ name: 'runId', description: 'Run id' })
  @ApiOkResponse({ type: CancelRunResponseDto })
  @ApiNotFoundResponse({ description: 'Run not found' })
  @ApiBadRequestResponse({ description: 'Run is not cancelable or other validation error' })
  async cancel(@Param('runId') runId: string): Promise<CancelRunResponseDto> {
    const run = await this.runs.getById(runId);
    if (!run) throw new NotFoundException('Run not found');

    // If already finished, do nothing but return status.
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'canceled') {
      return {
        runId,
        status: run.status as any,
        message: 'Run already finished',
      };
    }

    // Best-effort abort streaming if currently running in this process
    // (If you later have multiple workers, you’ll want a shared cancel signal.)
    this.engine.cancel(runId);

    await this.runs.markCanceled(runId);

    return {
      runId,
      status: 'canceled',
      message: null,
    };
  }
}
