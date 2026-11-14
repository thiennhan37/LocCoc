import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountAuthorityClient,
  IS_PUBLIC_KEY,
  type AuthenticatedUser,
} from '@loccoc/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

const publicPosts = new Set([
  '/auth/register',
  '/auth/verify-otp',
  '/auth/resend-otp',
  '/auth/login',
  '/auth/refresh',
  '/auth/social/google',
  '/auth/social/apple',
  '/payments/webhook/payos',
]);

@Injectable()
export class GatewayAccountAccessGuard implements CanActivate {
  constructor(
    private readonly authority: AccountAuthorityClient,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const path = req.path.replace(/\/$/, '') || '/';
    // Reject ambiguous paths before fetch URL normalization can change the route.
    if (
      /%|\\|\/\//.test(path) ||
      path.split('/').some((p) => p === '.' || p === '..')
    )
      throw new NotFoundException();
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    if (req.method === 'GET' && (path === '/' || path === '/health'))
      return true;
    if (
      req.method === 'POST' &&
      (publicPosts.has(path) ||
        path === '/auth/logout' ||
        path === '/auth/logout-all')
    )
      return true;
    req.user = (
      await this.authority.access(req.headers.authorization ?? '')
    ).user;
    return true;
  }
}
