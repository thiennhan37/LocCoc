import { Controller, Delete, Param, Put, Req, Headers } from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '@loccoc/common';
import type { Request } from 'express';
import { MediaService } from './media.service.js';

@Controller('users/me/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}
  @Put(':kind')
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
    @Req() req: Request,
  ) {
    return this.media.upload(user.userId, kind, req);
  }
  @Delete(':kind')
  clear(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
    @Headers('authorization') token?: string,
  ) {
    return this.media.clear(user.userId, kind, token);
  }
}
