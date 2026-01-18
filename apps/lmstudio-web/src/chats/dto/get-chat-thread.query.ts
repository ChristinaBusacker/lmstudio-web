import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export class GetChatThreadQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toBool(value))
  includeReasoning?: boolean = false;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toBool(value))
  includeStats?: boolean = false;

  /**
   * If true, deleted messages are still returned in the chain with deletedAt set.
   * Recommended: true for structural stability, UI can hide them.
   */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => toBool(value))
  includeDeleted?: boolean = true;
}
