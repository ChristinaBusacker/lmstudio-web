import { RunArtifactsService } from './run-artifacts.service';

describe('RunArtifactsService', () => {
  const repo = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ ...x, id: 'a1' })),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates JSON artifacts with expected fields', async () => {
    const svc = new RunArtifactsService(repo);
    const res = await svc.createJson({ runId: 'r1', toolName: 't', json: { a: 1 }, filename: 'x.json' });
    expect(res).toEqual(expect.objectContaining({ id: 'a1', runId: 'r1', kind: 'json' }));
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'r1', toolName: 't', mimeType: 'application/json', filename: 'x.json' }),
    );
  });

  it('creates text artifacts with default mime type', async () => {
    const svc = new RunArtifactsService(repo);
    const res = await svc.createText({ runId: 'r1', toolName: null, text: 'hi' });
    expect(res).toEqual(expect.objectContaining({ id: 'a1', runId: 'r1', kind: 'text' }));
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'text/plain', contentText: 'hi', contentJson: null }),
    );
  });
});
