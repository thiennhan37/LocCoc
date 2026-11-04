import { Body, Controller, Header, Headers, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { Public, RateLimit } from '@loccoc/common';
import { AppleSocialLoginDto, SocialLoginDto } from './dto/social-login.dto.js';
import { SocialAuthService } from './services/social-auth.service.js';

@Controller('auth/social')
export class SocialAuthController {
  constructor(private readonly social: SocialAuthService) {}

  @Post('google')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @RateLimit(5, 60_000)
  google(
    @Body() dto: SocialLoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-platform') platform?: string,
  ) {
    return this.social.login('google', dto, { ip, userAgent, platform });
  }

  @Post('apple')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @RateLimit(5, 60_000)
  apple(
    @Body() dto: AppleSocialLoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-platform') platform?: string,
  ) {
    return this.social.login('apple', dto, { ip, userAgent, platform }, dto.name);
  }
}
