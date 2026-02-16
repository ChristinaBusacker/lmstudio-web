/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join, extname } from 'path';
import { Repository } from 'typeorm';
import { AssetEntity } from './entities/asset.entity';

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(AssetEntity)
    private readonly assets: Repository<AssetEntity>,
  ) {}

  private async ensureDir(dir: string) {
    await fs.mkdir(dir, { recursive: true });
  }

  private assetsRoot(): string {
    return join(process.cwd(), 'data', 'assets');
  }

  async saveUpload(file: Express.Multer.File): Promise<AssetEntity> {
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');

    // De-dup: if we already have an identical file (by hash), reuse it.
    // This keeps the DB tidy and avoids wasting disk space.
    const existing = await this.assets.findOne({ where: { sha256 } });
    if (existing) return existing;

    const root = this.assetsRoot();
    await this.ensureDir(root);

    // Keep extension if present (helps later for debugging).
    const ext = extname(file.originalname || '').slice(0, 16);

    const asset = this.assets.create({
      originalFilename: file.originalname || 'upload',
      mimeType: file.mimetype || null,
      sizeBytes: file.size,
      sha256,
      path: '',
    });

    const saved = await this.assets.save(asset);
    const diskPath = join(root, `${saved.id}${ext}`);

    await fs.writeFile(diskPath, file.buffer);
    saved.path = diskPath;
    return this.assets.save(saved);
  }

  async getById(id: string): Promise<AssetEntity> {
    const a = await this.assets.findOne({ where: { id } });
    if (!a) throw new NotFoundException('Asset not found');
    return a;
  }

  async readBytes(id: string): Promise<Buffer> {
    const a = await this.getById(id);
    return fs.readFile(a.path);
  }
}
