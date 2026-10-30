import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/auth.decorator.js';
import { AccountAuthorityClient } from '../security/account-authority.client.js';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.js';

@Injectable()
export class AccountAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authority: AccountAuthorityClient,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const decision = await this.authority.access(
      request.headers.authorization ?? '',
    );
    request.user = decision.user;
    return true;
  }
}
