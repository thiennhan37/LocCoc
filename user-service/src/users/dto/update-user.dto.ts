import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { normalizeDisplayName } from '../display-name.policy.js';
import { IsMediaUrl } from '../../media/media-url.validator.js';

export class UpdateUserDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeDisplayName(value) : value,
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(1024)
  @IsMediaUrl()
  avatarUrl?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(1024)
  @IsMediaUrl()
  coverUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
