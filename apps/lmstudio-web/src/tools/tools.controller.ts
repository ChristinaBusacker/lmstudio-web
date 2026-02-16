import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WebSearchQueryDto, WebSearchResponseDto } from './dto/web-search.dto';
import { WebReadRequestDto, WebReadResponseDto } from './dto/web-read.dto';
import { DocReadRequestDto, DocReadResponseDto } from './dto/doc-read.dto';
import { WebSearchService } from './web/web-search.service';
import { WebReaderService } from './web/web-reader.service';
import { DocReaderService, ParsedFile } from './docs/doc-reader.service';

@ApiTags('Tools')
@Controller('tools')
export class ToolsController {
  constructor(
    private readonly webSearch: WebSearchService,
    private readonly webRead: WebReaderService,
    private readonly docRead: DocReaderService,
  ) {}

  @Get('web/search')
  @ApiOperation({ summary: 'Web search via SearXNG (JSON)' })
  @ApiOkResponse({ type: WebSearchResponseDto })
  async search(@Query() q: WebSearchQueryDto): Promise<WebSearchResponseDto> {
    return this.webSearch.search({ q: q.q, limit: q.limit ?? 10, runId: q.runId });
  }

  @Post('web/read')
  @ApiOperation({ summary: 'Fetch + Readability + sanitize => clean text + metadata' })
  @ApiOkResponse({ type: WebReadResponseDto })
  async readWeb(@Body() body: WebReadRequestDto): Promise<WebReadResponseDto> {
    return this.webRead.read({ url: body.url, runId: body.runId });
  }

  @Post('docs/read')
  @ApiOperation({
    summary: 'Read a document from URL or Asset id (supports ZIP with multiple files)',
  })
  @ApiOkResponse({ type: DocReadResponseDto })
  async readDoc(@Body() body: DocReadRequestDto): Promise<{
    sourceUrl: string | null;
    sourceAssetId: string | null;
    entries: ParsedFile[];
    artifactId: string | null;
  }> {
    return this.docRead.read({ assetId: body.assetId, runId: body.runId });
  }
}
