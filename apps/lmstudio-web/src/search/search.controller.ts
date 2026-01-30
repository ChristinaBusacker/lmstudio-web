// src/search/search.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchChatsQueryDto } from './dto/search-chats.query.dto';
import { SearchChatResultDto } from './dto/search-chat-result.dto';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('chats')
  @ApiOperation({
    summary: 'Search chats by term with ranking',
    description:
      'Ranks title matches higher than message matches. User messages rank higher than assistant messages.',
  })
  @ApiOkResponse({ type: [SearchChatResultDto] })
  async searchChats(@Query() q: SearchChatsQueryDto): Promise<SearchChatResultDto[]> {
    return this.search.searchChats(q);
  }
}
