import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  phone?: string;

  @IsString()
  @Length(6, 6)
  otp!: string;
}

export class ResendOtpDto {
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  phone?: string;

  @IsOptional()
  @IsIn(['email', 'phone'])
  channel?: 'email' | 'phone';
}
