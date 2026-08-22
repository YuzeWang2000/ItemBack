import { AttachmentCategory } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class UploadAttachmentDto {
  @ApiPropertyOptional({ enum: AttachmentCategory, default: AttachmentCategory.OTHER })
  @IsOptional()
  @IsEnum(AttachmentCategory)
  category?: AttachmentCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;
}
