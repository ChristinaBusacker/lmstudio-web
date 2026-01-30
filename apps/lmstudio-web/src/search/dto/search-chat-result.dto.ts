import { ApiProperty } from '@nestjs/swagger';

export type SearchMatchType = 'title' | 'user_message' | 'assistant_message';

export class SearchChatMatchDto {
  @ApiProperty({ enum: ['title', 'user_message', 'assistant_message'] })
  type!: SearchMatchType;

  @ApiProperty({ description: 'Optional snippet around the match', nullable: true })
  snippet!: string | null;
}

export class SearchChatResultDto {
  @ApiProperty()
  chatId!: string;

  @ApiProperty({ nullable: true })
  title!: string | null;

  @ApiProperty({ nullable: true })
  folderId!: string | null;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ description: 'Ranking score (higher = better)' })
  score!: number;

  @ApiProperty({ type: [SearchChatMatchDto] })
  matches!: SearchChatMatchDto[];
}
