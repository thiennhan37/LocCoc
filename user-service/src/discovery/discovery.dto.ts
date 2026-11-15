import { normalizeSearchQuery } from './search-query.js';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class DiscoveryPageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional() @IsString() @MaxLength(48) cursor?: string;
}
export class DiscoverySearchDto extends DiscoveryPageDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeSearchQuery(value) : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[\p{L}\p{N}_ .'-]+$/u)
  q!: string;
}
export class PrivacyDto {
  @ValidateIf((_o: PrivacyDto, value: unknown) => value !== undefined)
  @IsBoolean()
  recommendable?: boolean;
  @ValidateIf((_o: PrivacyDto, value: unknown) => value !== undefined)
  @IsBoolean()
  mutualVisibility?: boolean;
}
