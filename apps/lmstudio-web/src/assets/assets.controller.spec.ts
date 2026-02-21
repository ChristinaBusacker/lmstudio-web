import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { createMockResponse } from '../../test/utils/mock-response';

type AssetsServiceMock = Pick<AssetsService, 'saveUpload' | 'getById'>;

describe('AssetsController', () => {
  let controller: AssetsController;
  let assets: jest.Mocked<AssetsServiceMock>;

  beforeEach(async () => {
    assets = {
      saveUpload: jest.fn(),
      getById: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AssetsController],
      providers: [{ provide: AssetsService, useValue: assets }],
    }).compile();

    controller = moduleRef.get(AssetsController);
  });

  it('upload() maps saved asset entity to AssetDto', async () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    assets.saveUpload.mockResolvedValue({
      id: 'a1',
      originalFilename: 'test.txt',
      mimeType: 'text/plain',
      sizeBytes: 12,
      sha256: 'deadbeef',
      createdAt,
    } as unknown as Awaited<ReturnType<AssetsService['saveUpload']>>);

    const file = {
      originalname: 'test.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from('hello'),
      size: 5,
    } as unknown as Express.Multer.File;

    const dto = await controller.upload(file);

    expect(assets.saveUpload).toHaveBeenCalledWith(file);
    expect(dto).toEqual({
      id: 'a1',
      originalFilename: 'test.txt',
      mimeType: 'text/plain',
      sizeBytes: 12,
      sha256: 'deadbeef',
      createdAt: createdAt.toISOString(),
    });
  });

  it('download() sets headers and calls sendFile(path)', async () => {
    assets.getById.mockResolvedValue({
      id: 'a1',
      originalFilename: 'file.pdf',
      mimeType: 'application/pdf',
      path: '/tmp/a1.pdf',
    } as unknown as Awaited<ReturnType<AssetsService['getById']>>);

    const res = createMockResponse();

    await controller.download('a1', res as unknown as Response);

    expect(assets.getById).toHaveBeenCalledWith('a1');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment; filename='),
    );
    expect(res.sendFile).toHaveBeenCalledWith('/tmp/a1.pdf');
  });
});
