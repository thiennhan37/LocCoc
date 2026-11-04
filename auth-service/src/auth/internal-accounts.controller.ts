import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Headers,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UnauthorizedException,
  HttpCode,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Public } from '@loccoc/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AccountAccessService } from './account-access.service.js';

@Injectable()
export class InternalServiceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const supplied = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, unknown> }>().headers[
      'x-service-token'
    ];
    const expected = this.config.get<string>('INTERNAL_SERVICE_TOKEN', '');
    if (
      expected.length < 32 ||
      typeof supplied !== 'string' ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      throw new UnauthorizedException('Internal authentication required');
    return true;
  }
}

@Controller('internal')
@Public()
@SkipThrottle()
@UseGuards(InternalServiceGuard)
export class InternalAccountsController {
  constructor(private readonly accessService: AccountAccessService) {}
  @Get('push-sessions/:userId/:sessionId')
  pushSession(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.accessService.pushSession(userId, sessionId);
  }
  @Get('access')
  access(@Headers('authorization') token = '') {
    return this.accessService.access(token);
  }
  @Get('accounts/:id')
  async account(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') token = '',
  ) {
    await this.accessService.access(token);
    return this.accessService.snapshot(id);
  }
  @Post('accounts/:id/delete')
  @HttpCode(200)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('authorization') token = '',
  ) {
    return this.accessService.remove(id, token);
  }
}
