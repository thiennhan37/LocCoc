import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsOptional()
  @IsUUID()
  registrationId?: string;
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  phone?: string;

  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;
}

export class ResendOtpDto {
  @IsOptional()
  @IsUUID()
  registrationId?: string;
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
