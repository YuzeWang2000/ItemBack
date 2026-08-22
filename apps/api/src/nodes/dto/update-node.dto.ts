import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateItemDto } from './create-item.dto';

export class UpdateNodeDto extends PartialType(OmitType(CreateItemDto, ['parentId'] as const)) {}
