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
    summary: 'Read a document from uploaded Asset id (supports ZIP with multiple files)',
  })
  @ApiOkResponse({ type: DocReadResponseDto })
  async readDoc(@Body() body: DocReadRequestDto): Promise<DocReadResponseDto> {
    const out = await this.docRead.read({ assetId: body.assetId, runId: body.runId });

    // API contract uses `files`, internal service uses `entries`.
    return {
      sourceUrl: out.sourceUrl,
      sourceAssetId: out.sourceAssetId,
      files: (out.entries ?? []).map((e: ParsedFile) => {
        const error = e.warnings?.length ? e.warnings.join('; ') : null;
        const text = typeof e.content?.text === 'string' ? e.content.text : null;
        return {
          name: e.name,
          mimeType: e.mimeType,
          text,
          error,
        };
      }),
      artifactId: out.artifactId,
    };
  }
}
