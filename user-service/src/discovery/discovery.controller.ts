import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '@loccoc/common';
import { DiscoveryPageDto, PrivacyDto } from './discovery.dto.js';
import { DiscoveryService } from './discovery.service.js';

@Controller('users')
export class DiscoveryController {
  constructor(private readonly service: DiscoveryService) {}
  @Get('recommendations') recommendations(
    @CurrentUser() u: AuthenticatedUser,
    @Query() dto: DiscoveryPageDto,
  ) {
    return this.service.recommendations(u.userId, dto);
  }
  @Post('recommendations/:id/dismiss')
  @HttpCode(204)
  dismiss(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.dismiss(u.userId, id);
  }
  @Get('me/privacy') privacy(@CurrentUser() u: AuthenticatedUser) {
    return this.service.privacy(u.userId);
  }
  @Patch('me/privacy') setPrivacy(
    @CurrentUser() u: AuthenticatedUser,
    @Body() dto: PrivacyDto,
  ) {
    return this.service.setPrivacy(u.userId, dto);
  }
  @Get('profiles/:id/mutual-friends') mutual(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: DiscoveryPageDto,
  ) {
    return this.service.mutual(u.userId, id, dto);
  }
}
