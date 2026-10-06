import { Body, Controller, HttpCode, HttpStatus, Ip, Post, Req } from '@nestjs/common';
import { RateLimit } from '@loccoc/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResendOtpDto, VerifyOtpDto } from './dto/otp.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @RateLimit(5, 60_000)
  register(@Body() dto: RegisterDto, @Ip() ip: string) { return this.auth.register(dto, { ip }); }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @RateLimit(10, 60_000)
  verifyOtp(@Body() dto: VerifyOtpDto) { return this.auth.verifyOtp(dto); }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @RateLimit(5, 60_000)  
  resendOtp(@Body() dto: ResendOtpDto, @Ip() ip: string) { return this.auth.resendOtp(dto, { ip }); }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit(10, 60_000)
  login(@Body() dto: LoginDto, @Ip() ip: string) { return this.auth.login(dto, { ip }); }
}


