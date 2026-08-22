import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItemStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsDecimal,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateItemDto {
  @ApiProperty({ example: '通勤书包' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  parentId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isContainer?: boolean;

  @ApiPropertyOptional({ enum: ItemStatus, default: ItemStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString({ strict: true })
  acquiredDate?: string;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString({ strict: true })
  endDate?: string;

  @ApiPropertyOptional({ example: '600.00', type: String })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4', force_decimal: false })
  valueAmount?: string;

  @ApiPropertyOptional({ example: 'CNY' })
  @ValidateIf((dto: CreateItemDto) => dto.valueAmount != null && dto.valueAmount !== '')
  @IsString()
  @Length(3, 3)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  currency?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  serialNumber?: string;
}
