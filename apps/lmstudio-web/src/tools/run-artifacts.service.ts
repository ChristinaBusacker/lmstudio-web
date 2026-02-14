/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RunArtifactEntity, RunArtifactKind } from './entities/run-artifact.entity';

@Injectable()
export class RunArtifactsService {
  constructor(
    @InjectRepository(RunArtifactEntity)
    private readonly artifacts: Repository<RunArtifactEntity>,
  ) {}

  async createJson(params: { runId: string; toolName?: string | null; json: any; filename?: string }) {
    const a = this.artifacts.create({
      runId: params.runId,
      toolName: params.toolName ?? null,
      kind: 'json' satisfies RunArtifactKind,
      mimeType: 'application/json',
      filename: params.filename ?? null,
      contentJson: params.json,
      contentText: null,
      blobPath: null,
    });
    return this.artifacts.save(a);
  }

  async createText(params: {
    runId: string;
    toolName?: string | null;
    text: string;
    filename?: string;
    mimeType?: string;
  }) {
    const a = this.artifacts.create({
      runId: params.runId,
      toolName: params.toolName ?? null,
      kind: 'text' satisfies RunArtifactKind,
      mimeType: params.mimeType ?? 'text/plain',
      filename: params.filename ?? null,
      contentJson: null,
      contentText: params.text,
      blobPath: null,
    });
    return this.artifacts.save(a);
  }
}
