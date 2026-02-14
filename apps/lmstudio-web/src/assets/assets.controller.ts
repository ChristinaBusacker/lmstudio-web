import { Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AssetDto } from './dto/asset.dto';
import { AssetsService } from './assets.service';

@ApiTags('Assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post('upload')
  @ApiOperation({
    summary: 'Upload a file as an Asset (stored on disk, metadata in DB)',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOkResponse({ type: AssetDto })
  async upload(@UploadedFile() file: Express.Multer.File): Promise<AssetDto> {
    const saved = await this.assets.saveUpload(file);
    return {
      id: saved.id,
      originalFilename: saved.originalFilename,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      sha256: saved.sha256,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Download an Asset by id' })
  @ApiParam({ name: 'id' })
  async download(@Param('id') id: string, @Res() res: Response) {
    const asset = await this.assets.getById(id);
    res.setHeader('Content-Type', asset.mimeType ?? 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(asset.originalFilename)}"`,
    );
    return res.sendFile(asset.path);
  }
}
