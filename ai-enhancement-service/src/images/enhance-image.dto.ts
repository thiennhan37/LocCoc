import { IsIn, IsString } from 'class-validator';
import type { ImageFilterId } from './image.types.js';

export class EnhanceImageDto {
  @IsString()
  @IsIn(['handwritten_diary', 'subject_sticker'])
  filterId!: ImageFilterId;
}
