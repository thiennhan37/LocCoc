import { normalizeSearchQuery } from '../discovery/search-query.js';
import { Transform, Type } from 'class-transformer';
import { normalizeDisplayName } from '../users/display-name.policy.js';
import {
  IsIn,
  ValidateIf,
  MinLength,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}
export class SearchUsersDto extends PageDto {
  @ValidateIf(
    (o: SearchUsersDto) => o.q !== undefined || o.username === undefined,
  )
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeSearchQuery(value) : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[\p{L}\p{N}_ .'-]+$/u)
  q?: string;
  @IsOptional() @IsString() @MaxLength(48) cursor?: string;
  @ValidateIf(
    (o: SearchUsersDto) => o.username !== undefined || o.q === undefined,
  )
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z0-9_]{2,30}$/)
  username!: string;
}
export class ClaimUsernameDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z0-9_]{2,30}$/)
  username!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? normalizeDisplayName(value) || undefined
      : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;
}
export class UsernameProfileDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z0-9_]{2,30}$/)
  username!: string;
}
export class SendRequestDto {
  @IsUUID() receiverId!: string;
}
export class RequestsQueryDto extends PageDto {
  @IsOptional() @IsIn(['incoming', 'outgoing']) direction:
    'incoming' | 'outgoing' = 'incoming';
}
