import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser, type AuthenticatedUser } from '@loccoc/common';
import { NotificationsService } from './notifications.service.js';
import { DeviceDto, ListDto, SeenDto } from './notifications.dto.js';
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
  @Get() list(@CurrentUser() u: AuthenticatedUser, @Query() q: ListDto) {
    return this.service.list(u.userId, q);
  }
  @Get('counts') counts(@CurrentUser() u: AuthenticatedUser) {
    return this.service.counts(u.userId);
  }
  @Patch('seen') seen(@CurrentUser() u: AuthenticatedUser, @Body() b: SeenDto) {
    return this.service.seen(u.userId, b.seenCursor);
  }
  @Patch(':id/read') read(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.read(u.userId, id);
  }
  @Put('devices/:id') register(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: DeviceDto,
  ) {
    return this.service.register(
      u.userId,
      u.sessionId,
      id,
      b.token,
      b.platform,
    );
  }
  @Delete('devices/:id') unregister(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.unregister(u.userId, u.sessionId, id);
  }
}
