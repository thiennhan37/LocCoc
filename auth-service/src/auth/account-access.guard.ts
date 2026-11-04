import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, type AuthenticatedUser } from '@loccoc/common';
import { AccountAccessService } from './account-access.service.js';

@Injectable()
export class LocalAccountAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accounts: AccountAccessService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const req = context
      .switchToHttp()
      .getRequest<{
        method: string;
        path: string;
        headers: { authorization?: string };
        user?: AuthenticatedUser;
      }>();
    const logout =
      req.method === 'POST' &&
      ['/auth/logout', '/auth/logout-all'].includes(
        req.path.replace(/\/$/, ''),
      );
    req.user = (
      await this.accounts.access(req.headers.authorization ?? '', logout)
    ).user;
    return true;
  }
}
