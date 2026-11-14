import { Body, Controller, Headers, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { CurrentUser, Public, RateLimit, Roles, type AuthenticatedUser } from '@loccoc/common';
import { AuthService, type AuthRequestContext } from './auth.service.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResendOtpDto, VerifyOtpDto } from './dto/otp.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Public()
  @RateLimit(5, 60_000)
  register(@Body() dto: RegisterDto, @Ip() ip: string) { return this.auth.register(dto, { ip }); }

  @Post('verify-otp')
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit(10, 60_000)
  verifyOtp(@Body() dto: VerifyOtpDto) { return this.auth.verifyOtp(dto); }

  @Post('resend-otp')
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit(5, 60_000)
  resendOtp(@Body() dto: ResendOtpDto, @Ip() ip: string) { return this.auth.resendOtp(dto, { ip }); }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit(10, 60_000)
  login(@Body() dto: LoginDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string, @Headers('x-platform') platform?: string) {
    return this.auth.login(dto, { ip, userAgent, platform });
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit(20, 60_000)
  refresh(@Body() dto: RefreshDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string, @Headers('x-platform') platform?: string) {
    return this.auth.refresh(dto, { ip, userAgent, platform });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Roles('user', 'moderator', 'admin')
  logout(@CurrentUser() user: AuthenticatedUser) { return this.auth.logout({ userId: user.userId, sessionId: user.sessionId }); }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @Roles('user', 'moderator', 'admin')
  logoutAll(@CurrentUser() user: AuthenticatedUser) { return this.auth.logoutAll(user.userId); }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @Roles('user', 'moderator', 'admin')
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-platform') platform?: string,
  ) {
    const context: AuthRequestContext = { ip, userAgent, platform };
    return this.auth.changePassword(dto, { userId: user.userId, sessionId: user.sessionId }, context);
  }
}