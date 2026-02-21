import { Test } from '@nestjs/testing';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import type { SearchChatResultDto } from './dto/search-chat-result.dto';
import { SearchChatsQueryDto } from './dto/search-chats.query.dto';

type SearchServiceMock = Pick<SearchService, 'searchChats'>;

describe('SearchController', () => {
  let controller: SearchController;
  let search: jest.Mocked<SearchServiceMock>;

  beforeEach(async () => {
    search = { searchChats: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: search }],
    }).compile();

    controller = moduleRef.get(SearchController);
  });

  it('searchChats() delegates to service with query dto', async () => {
    const results: SearchChatResultDto[] = [
      {
        chatId: 'c1',
        title: 'Hello',
        folderId: null,
        updatedAt: '2026-01-01T00:00:00.000Z',
        score: 1,
        matches: [{ type: 'title', snippet: null }],
      },
    ];
    search.searchChats.mockResolvedValue(results);

    const q: SearchChatsQueryDto = { term: 'hello', limit: 5 };
    await expect(controller.searchChats(q)).resolves.toBe(results);
    expect(search.searchChats).toHaveBeenCalledWith(q);
  });
});
