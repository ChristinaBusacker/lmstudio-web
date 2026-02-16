import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { AssetExtractService } from './asset-extract.service';
import { AssetEntity } from './entities/asset.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AssetEntity])],
  controllers: [AssetsController],
  providers: [AssetsService, AssetExtractService],
  exports: [AssetsService, AssetExtractService],
})
export class AssetsModule {}
