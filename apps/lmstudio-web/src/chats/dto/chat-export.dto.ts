import { ApiProperty } from '@nestjs/swagger';

export class ExportedVariantDto {
  @ApiProperty() id!: string;
  @ApiProperty() variantIndex!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() content!: string;
  @ApiProperty({ nullable: true }) reasoning!: string | null;
  @ApiProperty({ nullable: true, description: 'Arbitrary stats payload' }) stats!: any;
  @ApiProperty() createdAt!: string;
}

export class ExportedMessageDto {
  @ApiProperty() id!: string;
  @ApiProperty() role!: 'system' | 'user' | 'assistant';
  @ApiProperty({ nullable: true }) parentMessageId!: string | null;
  @ApiProperty({ nullable: true }) deletedAt!: string | null;
  @ApiProperty({ nullable: true }) editedAt!: string | null;
  @ApiProperty() createdAt!: string;

  @ApiProperty({ type: [ExportedVariantDto] })
  variants!: ExportedVariantDto[];
}

export class ChatExportBundleDto {
  @ApiProperty({ description: 'Schema version for forward compatibility' })
  version!: number;

  @ApiProperty() title!: string | null;
  @ApiProperty({ nullable: true }) defaultSettingsProfileId!: string | null;
  @ApiProperty({ nullable: true }) activeHeadMessageId!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;

  @ApiProperty({ type: [ExportedMessageDto] })
  messages!: ExportedMessageDto[];
}
