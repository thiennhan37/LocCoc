import { Transform, Type } from 'class-transformer';
import {
  IsIn,
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
  @IsOptional() @IsString() @MaxLength(255) displayName?: string;
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
