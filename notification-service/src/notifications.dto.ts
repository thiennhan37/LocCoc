import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
export class ListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @Length(1, 2048) cursor?: string;
}
export class SeenDto {
  @IsString() @Length(1, 2048) seenCursor!: string;
}
export class DeviceDto {
  @IsString() @Length(20, 4096) token!: string;
  @IsIn(['android', 'ios']) platform!: 'android' | 'ios';
}
