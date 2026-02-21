import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { createMockResponse } from '../../test/utils/mock-response';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { CreateWorkflowRunDto } from './dto/create-workflow-run.dto';
import { ImportWorkflowBundleDto } from './dto/import-workflow-bundle.dto';
import type { NodeDiagramModel } from '@shared/types/node-model.types';

type WorkflowsServiceMock = Pick<
  WorkflowsService,
  | 'create'
  | 'list'
  | 'get'
  | 'delete'
  | 'update'
  | 'createRun'
  | 'listRuns'
  | 'getRun'
  | 'getArtifact'
  | 'rerunFrom'
  | 'pauseRun'
  | 'resumeRun'
  | 'cancelRun'
  | 'exportWorkflowBundle'
  | 'importWorkflowBundle'
>;

describe('WorkflowsController', () => {
  let controller: WorkflowsController;
  let workflows: jest.Mocked<WorkflowsServiceMock>;

  beforeEach(async () => {
    workflows = {
      create: jest.fn(),
      list: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      createRun: jest.fn(),
      listRuns: jest.fn(),
      getRun: jest.fn(),
      getArtifact: jest.fn(),
      rerunFrom: jest.fn(),
      pauseRun: jest.fn(),
      resumeRun: jest.fn(),
      cancelRun: jest.fn(),
      exportWorkflowBundle: jest.fn(),
      importWorkflowBundle: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [WorkflowsController],
      providers: [{ provide: WorkflowsService, useValue: workflows }],
    }).compile();

    controller = moduleRef.get(WorkflowsController);
  });

  it('createWorkflow() delegates to service with ownerKey', async () => {
    workflows.create.mockResolvedValue({ id: 'w1' } as unknown as Awaited<
      ReturnType<WorkflowsService['create']>
    >);

    const dto: CreateWorkflowDto = {
      name: 'WF',
      graph: { nodes: [], edges: [] } as unknown as NodeDiagramModel,
    };

    await expect(controller.createWorkflow(dto)).resolves.toEqual({ id: 'w1' });
    expect(workflows.create).toHaveBeenCalledWith('default', expect.any(Object));
  });

  it('listRuns() normalizes limit to number', async () => {
    workflows.listRuns.mockResolvedValue({ items: [], nextCursor: null } as unknown as Awaited<
      ReturnType<WorkflowsService['listRuns']>
    >);
    await controller.listRuns('w1', 'running', '7');
    expect(workflows.listRuns).toHaveBeenCalledWith('default', {
      workflowId: 'w1',
      status: 'running',
      limit: 7,
    });
  });

  it('downloadArtifact() returns JSON pretty-printed for kind=json', async () => {
    workflows.getArtifact.mockResolvedValue({
      id: 'a1',
      kind: 'json',
      filename: 'data.json',
      mimeType: null,
      blobPath: null,
      contentJson: { hello: 'world' },
      contentText: null,
    } as unknown as Awaited<ReturnType<WorkflowsService['getArtifact']>>);

    const res = createMockResponse();
    await controller.downloadArtifact('a1', res as unknown as Response);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
    expect(res.send).toHaveBeenCalledWith(JSON.stringify({ hello: 'world' }, null, 2));
  });

  it('downloadArtifact() returns text for kind=text', async () => {
    workflows.getArtifact.mockResolvedValue({
      id: 'a2',
      kind: 'text',
      filename: 'note.txt',
      mimeType: null,
      blobPath: null,
      contentJson: null,
      contentText: 'hello',
    } as unknown as Awaited<ReturnType<WorkflowsService['getArtifact']>>);

    const res = createMockResponse();
    await controller.downloadArtifact('a2', res as unknown as Response);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain; charset=utf-8');
    expect(res.send).toHaveBeenCalledWith('hello');
  });

  it('downloadArtifact() returns 404 when no content is available', async () => {
    workflows.getArtifact.mockResolvedValue({
      id: 'a3',
      kind: 'binary',
      filename: null,
      mimeType: null,
      blobPath: null,
      contentJson: null,
      contentText: null,
    } as unknown as Awaited<ReturnType<WorkflowsService['getArtifact']>>);

    const res = createMockResponse();
    await controller.downloadArtifact('a3', res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith('Artifact content not available');
  });

  it('exportWorkflow() sets headers and sends a JSON bundle', async () => {
    workflows.exportWorkflowBundle.mockResolvedValue({
      workflow: { id: 'w1', name: 'My WF' },
      runs: [],
      artifacts: [],
    } as unknown as Awaited<ReturnType<WorkflowsService['exportWorkflowBundle']>>);

    const res = createMockResponse();
    await controller.exportWorkflow('w1', 'true', '10', res as unknown as Response);

    expect(workflows.exportWorkflowBundle).toHaveBeenCalledWith('default', 'w1', {
      includeRuns: true,
      limitRuns: 10,
    });
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json; charset=utf-8');
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('"workflow"'));
  });

  it('rerunFrom/pauseRun/resumeRun/cancelRun delegate to service', async () => {
    workflows.rerunFrom.mockResolvedValue({ ok: true } as unknown as Awaited<
      ReturnType<WorkflowsService['rerunFrom']>
    >);
    workflows.pauseRun.mockResolvedValue({ ok: true } as unknown as Awaited<
      ReturnType<WorkflowsService['pauseRun']>
    >);
    workflows.resumeRun.mockResolvedValue({ ok: true } as unknown as Awaited<
      ReturnType<WorkflowsService['resumeRun']>
    >);
    workflows.cancelRun.mockResolvedValue({ ok: true } as unknown as Awaited<
      ReturnType<WorkflowsService['cancelRun']>
    >);

    await controller.rerunFrom('r1', 'n1');
    await controller.pauseRun('r1');
    await controller.resumeRun('r1');
    await controller.cancelRun('r1');

    expect(workflows.rerunFrom).toHaveBeenCalledWith('default', 'r1', 'n1');
    expect(workflows.pauseRun).toHaveBeenCalledWith('default', 'r1');
    expect(workflows.resumeRun).toHaveBeenCalledWith('default', 'r1');
    expect(workflows.cancelRun).toHaveBeenCalledWith('default', 'r1');
  });

  it('list/get/delete/update delegate to service with ownerKey', async () => {
    workflows.list.mockResolvedValue([{ id: 'w1' }] as unknown as Awaited<
      ReturnType<WorkflowsService['list']>
    >);
    workflows.get.mockResolvedValue({ id: 'w1' } as unknown as Awaited<
      ReturnType<WorkflowsService['get']>
    >);
    workflows.delete.mockResolvedValue({ ok: true } as unknown as Awaited<
      ReturnType<WorkflowsService['delete']>
    >);
    workflows.update.mockResolvedValue({ id: 'w1', name: 'Updated' } as unknown as Awaited<
      ReturnType<WorkflowsService['update']>
    >);

    await controller.listWorkflows();
    await controller.getWorkflow('w1');
    await controller.deleteWorkflow('w1');
    const dto: UpdateWorkflowDto = { name: 'Updated' };
    await controller.updateWorkflow('w1', dto);

    expect(workflows.list).toHaveBeenCalledWith('default');
    expect(workflows.get).toHaveBeenCalledWith('default', 'w1');
    expect(workflows.delete).toHaveBeenCalledWith('default', 'w1');
    expect(workflows.update).toHaveBeenCalledWith('default', 'w1', dto);
  });

  it('startRun/importWorkflow delegate to service with ownerKey', async () => {
    workflows.createRun.mockResolvedValue({ runId: 'wr1' } as unknown as Awaited<
      ReturnType<WorkflowsService['createRun']>
    >);
    workflows.importWorkflowBundle.mockResolvedValue({ id: 'w2' } as unknown as Awaited<
      ReturnType<WorkflowsService['importWorkflowBundle']>
    >);

    const runDto: CreateWorkflowRunDto = { label: 'Test' };
    await controller.startRun('w1', runDto);

    const importDto: ImportWorkflowBundleDto = {
      name: 'Imported',
      // keep bundle shape minimal; service tests cover full schema
      bundle: { workflow: { id: 'x', name: 'x', graph: { nodes: [], edges: [] } } },
    } as unknown as ImportWorkflowBundleDto;
    await controller.importWorkflow(importDto);

    expect(workflows.createRun).toHaveBeenCalledWith('default', 'w1', runDto);
    expect(workflows.importWorkflowBundle).toHaveBeenCalledWith('default', {
      bundle: expect.any(Object),
      name: 'Imported',
    });
  });
});
