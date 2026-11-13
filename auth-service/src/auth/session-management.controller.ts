import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  RateLimit,
  Roles,
  type AuthenticatedUser,
} from '@loccoc/common';
import { ListSessionsDto } from './dto/list-sessions.dto.js';
import { SessionManagementService } from './session-management.service.js';

@Controller('auth/sessions')
@Roles('user', 'moderator', 'admin')
export class SessionManagementController {
  constructor(private readonly service: SessionManagementService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @RateLimit(30, 60_000)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSessionsDto,
  ) {
    return this.service.list(
      { userId: user.userId, sessionId: user.sessionId },
      query,
    );
  }
  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  @RateLimit(20, 60_000)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.revoke(
      { userId: user.userId, sessionId: user.sessionId },
      id,
    );
  }

  @Get('history')
  @Header('Cache-Control', 'no-store')
  @RateLimit(30, 60_000)
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListSessionsDto,
  ) {
    return this.service.history(
      { userId: user.userId, sessionId: user.sessionId },
      query,
    );
  }
}
