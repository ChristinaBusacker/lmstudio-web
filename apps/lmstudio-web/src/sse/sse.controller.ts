/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Controller, MessageEvent, Param, Query, Req, Sse } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { Observable, merge, interval, from } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { SseBusService } from './sse-bus.service';
import type { Request } from 'express';
import { SseEnvelopeApiDto } from './dto/sse-events.dto';
import type { SseEnvelope } from '@shared/contracts';

@ApiTags('SSE')
@Controller('sse')
export class SseController {
  private heartbeat$ = interval(30_000).pipe(
    map(() =>
      this.toMessageEvent(
        this.bus.publishEphemeral({
          type: 'heartbeat',
          payload: { ok: true },
        }),
      ),
    ),
  );

  constructor(private readonly bus: SseBusService) {}

  @Sse('chats/:chatId')
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: 'Chat-scoped SSE stream (run updates + active variant snapshots)',
    description:
      'Emits events for a single chat:\n' +
      '- run.status\n' +
      '- variant.snapshot (contentSoFar for the currently generating assistant message)\n' +
      '- heartbeat\n\n' +
      'Replay: Uses Last-Event-ID to replay buffered events. Clients should resync via REST on reconnect.',
  })
  @ApiOkResponse({
    description: 'SSE stream (text/event-stream). Use EventSource.',
    content: {
      'text/event-stream': {
        schema: { $ref: getSchemaPath(SseEnvelopeApiDto) },
      },
    },
  })
  @ApiParam({ name: 'chatId', description: 'Chat id' })
  @ApiQuery({
    name: 'includeVariants',
    required: false,
    description: 'If false, suppresses variant.snapshot events.',
    schema: { type: 'boolean', default: true },
  })
  @ApiQuery({
    name: 'includeRuns',
    required: false,
    description: 'If false, suppresses run.status events.',
    schema: { type: 'boolean', default: true },
  })
  streamChat(
    @Req() req: Request,
    @Param('chatId') chatId: string,
    @Query('includeVariants') includeVariants?: string,
    @Query('includeRuns') includeRuns?: string,
  ): Observable<MessageEvent> {
    const wantVariants = includeVariants !== 'false';
    const wantRuns = includeRuns !== 'false';

    const lastId = this.parseLastEventId(req);

    const replay = this.bus.getChatReplay(chatId, lastId).filter((e) => {
      if (e.type === 'variant.snapshot') return wantVariants;
      if (e.type === 'run.status') return wantRuns;
      return true;
    });
    const replay$ = from(replay).pipe(map((e) => this.toMessageEvent(e)));

    const live$ = this.bus.observeChat(chatId).pipe(
      filter((e) => {
        if (e.type === 'variant.snapshot') return wantVariants;
        if (e.type === 'run.status') return wantRuns;
        return true;
      }),
      map((e) => this.toMessageEvent(e)),
    );

    return merge(replay$, live$, this.heartbeat$);
  }

  @Sse('global')
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: 'Global SSE stream (runs + sidebar + models)',
    description:
      'Emits global UI events:\n' +
      '- run.status (all chats)\n' +
      '- sidebar.changed\n' +
      '- models.changed\n' +
      '- heartbeat\n\n' +
      'Replay: uses Last-Event-ID with an in-memory ring buffer.',
  })
  @ApiOkResponse({
    description: 'SSE stream (text/event-stream). Use EventSource.',
    content: {
      'text/event-stream': {
        schema: { $ref: getSchemaPath(SseEnvelopeApiDto) },
      },
    },
  })
  streamGlobal(@Req() req: Request): Observable<MessageEvent> {
    const lastId = this.parseLastEventId(req);

    const replay = this.bus.getRunReplay(lastId);
    const replay$ = from(replay).pipe(map((e) => this.toMessageEvent(e)));

    const live$ = this.bus.observeAll().pipe(
      filter((e) => !e.chatId), // global events only
      filter(
        (e) =>
          e.type === 'run.status' || e.type === 'sidebar.changed' || e.type === 'models.changed',
      ),
      map((e) => this.toMessageEvent(e)),
    );

    const heartbeat$ = interval(15_000).pipe(
      map(() =>
        this.toMessageEvent(
          this.bus.publish({
            type: 'heartbeat',
            payload: { ok: true },
          }),
        ),
      ),
    );

    return merge(replay$, live$, heartbeat$);
  }

  @Sse('workflows/:workflowId')
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: 'Workflow-scoped SSE stream (run + node updates)',
    description:
      'Emits events for a single workflow:\n' +
      '- workflow.run.status\n' +
      '- workflow.node-run.upsert\n' +
      '- workflow.artifact.created\n' +
      '- heartbeat\n\n' +
      'Replay: Uses Last-Event-ID to replay buffered events. Clients should resync via REST on reconnect.',
  })
  streamWorkflow(
    @Req() req: Request,
    @Param('workflowId') workflowId: string,
  ): Observable<MessageEvent> {
    const lastId = this.parseLastEventId(req);

    const replay$ = from(this.bus.getWorkflowReplay(workflowId, lastId)).pipe(
      map((e) => this.toMessageEvent(e)),
    );

    const live$ = this.bus.observeWorkflow(workflowId).pipe(
      filter(
        (e) =>
          e.type === 'workflow.run.status' ||
          e.type === 'workflow.node-run.upsert' ||
          e.type === 'workflow.artifact.created',
      ),
      map((e) => this.toMessageEvent(e)),
    );

    return merge(replay$, live$, this.heartbeat$);
  }

  @Sse('workflow-runs/:runId')
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: 'Workflow-run scoped SSE stream (node updates + artifacts)',
    description:
      'Emits events for a single workflow run:\n' +
      '- workflow.run.status\n' +
      '- workflow.node-run.upsert\n' +
      '- workflow.artifact.created\n' +
      '- heartbeat\n\n' +
      'Replay: Uses Last-Event-ID to replay buffered events. Clients should resync via REST on reconnect.',
  })
  streamWorkflowRun(@Req() req: Request, @Param('runId') runId: string): Observable<MessageEvent> {
    const lastId = this.parseLastEventId(req);

    const replay$ = from(this.bus.getWorkflowRunReplay(runId, lastId)).pipe(
      map((e) => this.toMessageEvent(e)),
    );

    const live$ = this.bus.observeWorkflowRun(runId).pipe(
      filter(
        (e) =>
          e.type === 'workflow.run.status' ||
          e.type === 'workflow.node-run.upsert' ||
          e.type === 'workflow.artifact.created',
      ),
      map((e) => this.toMessageEvent(e)),
    );

    return merge(replay$, live$, this.heartbeat$);
  }

  private toMessageEvent(e: SseEnvelope): MessageEvent {
    return {
      id: String(e.id),
      type: e.type,
      data: e,
    };
  }

  private parseLastEventId(req: Request): number | undefined {
    // Browser sets Last-Event-ID header on reconnect if server sends `id:`.
    const raw = req.header('last-event-id') ?? req.header('Last-Event-ID');
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
}
