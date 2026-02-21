import { Test } from '@nestjs/testing';
import { ToolsController } from './tools.controller';
import { WebSearchService } from './web/web-search.service';
import { WebReaderService } from './web/web-reader.service';
import { DocReaderService } from './docs/doc-reader.service';
import type { ParsedFile } from './docs/doc-reader.service';
import type { WebSearchResponseDto } from './dto/web-search.dto';
import type { WebReadResponseDto } from './dto/web-read.dto';

type WebSearchMock = Pick<WebSearchService, 'search'>;
type WebReadMock = Pick<WebReaderService, 'read'>;
type DocReadMock = Pick<DocReaderService, 'read'>;

describe('ToolsController', () => {
  let controller: ToolsController;
  let webSearch: jest.Mocked<WebSearchMock>;
  let webRead: jest.Mocked<WebReadMock>;
  let docRead: jest.Mocked<DocReadMock>;

  beforeEach(async () => {
    webSearch = { search: jest.fn() };
    webRead = { read: jest.fn() };
    docRead = { read: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [ToolsController],
      providers: [
        { provide: WebSearchService, useValue: webSearch },
        { provide: WebReaderService, useValue: webRead },
        { provide: DocReaderService, useValue: docRead },
      ],
    }).compile();

    controller = moduleRef.get(ToolsController);
  });

  it('search() delegates to WebSearchService.search with normalized params', async () => {
    const resp: WebSearchResponseDto = {
      query: 'Jest Test',
      results: [
        {
          title: 'Jest · Delightful JavaScript Testing',
          url: 'https://jestjs.io/',
          snippet:
            'Jest is a delightful JavaScript Testing Framework with a focus on simplicity. It works with projects using: Babel, TypeScript, Node, React, Angular, Vue ...',
          publishedAt: null,
          engine: 'google',
        },
        {
          title: 'Unit Testing nach Frontend-Art mit Jest',
          url: 'https://entwickler.de/testing/unit-testing-nach-frontend-art',
          snippet:
            'Im Fokus dieses Artikels steht das Thema: Unit Testing. Wir zeigen, wie du mit Jest effiziente Frontend-Tests schreibst.',
          publishedAt: null,
          engine: 'google',
        },
        {
          title: 'Jest',
          url: 'https://www.testautomatisierung.org/lexikon/jest/',
          snippet:
            'Jest ist ein Open Source JavaScript-Test-Tool, das Fehler in der Programmiersprache automatisch erkennen soll.',
          publishedAt: null,
          engine: 'google',
        },
      ],
      artifactId: null,
    } as WebSearchResponseDto;
    webSearch.search.mockResolvedValue(resp);

    await expect(controller.search({ q: 'q', limit: 3, runId: 'r1' })).resolves.toBe(resp);
    expect(webSearch.search).toHaveBeenCalledWith({ q: 'q', limit: 3, runId: 'r1' });
  });

  it('readWeb() delegates to WebReaderService.read', async () => {
    const resp: WebReadResponseDto = {
      url: 'https://x',
      text: 'body',
      meta: {
        title: {},
        author: {},
        publishedAt: {},
        siteName: {},
        lang: {},
      },
    } as WebReadResponseDto;
    webRead.read.mockResolvedValue(resp);

    await expect(controller.readWeb({ url: 'https://x', runId: 'r1' })).resolves.toBe(resp);
    expect(webRead.read).toHaveBeenCalledWith({ url: 'https://x', runId: 'r1' });
  });

  it('readDoc() delegates to DocReaderService.read', async () => {
    const entries: ParsedFile[] = [
      { name: 'file', mimeType: 'txt', kind: 'test', content: {}, warnings: [] },
    ];
    const resp: {
      sourceUrl: null;
      sourceAssetId: 'a1';
      entries: ParsedFile[];
      artifactId: null;
    } = {
      sourceUrl: null,
      sourceAssetId: 'a1',
      entries,
      artifactId: null,
    };
    docRead.read.mockResolvedValue(
      resp as unknown as Awaited<ReturnType<DocReaderService['read']>>,
    );

    await expect(controller.readDoc({ assetId: 'a1', runId: 'r1' })).resolves.toEqual(resp);
    expect(docRead.read).toHaveBeenCalledWith({ assetId: 'a1', runId: 'r1' });
  });
});
