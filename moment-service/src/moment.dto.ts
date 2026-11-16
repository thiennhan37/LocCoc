import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
} from "class-validator";

const canonical = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.normalize("NFC").trim() : value;

export class CreateMomentDto {
  @IsString() @MaxLength(1000) @Transform(canonical) caption = "";
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags: string[] = [];
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/u)
  capturedAt?: string;
  @IsOptional() @IsUUID() albumId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(canonical)
  place?: string;
}

export class SearchMomentsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Transform(canonical)
  query!: string;
  @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional() @IsUUID() albumId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(canonical)
  place?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/u)
  dateFrom?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/u)
  dateTo?: string;
  @IsOptional() @IsBoolean() requireSemantic = false;
}

export class ListMomentsDto {
  @IsOptional() @IsString() @MaxLength(256) cursor?: string;
  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(50) limit = 20;
}
