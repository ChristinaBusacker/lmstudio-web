import { ApiProperty } from '@nestjs/swagger';

export class AssetDto {
  @ApiProperty() id!: string;
  @ApiProperty() originalFilename!: string;
  @ApiProperty({ nullable: true }) mimeType!: string | null;
  @ApiProperty() sizeBytes!: number;
  @ApiProperty() sha256!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
