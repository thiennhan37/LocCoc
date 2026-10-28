import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
