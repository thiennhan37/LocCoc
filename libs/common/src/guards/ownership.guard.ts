import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { OWNERSHIP_KEY, type OwnershipOptions } from '../decorators/ownership.decorator.js';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.js';

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<OwnershipOptions>(OWNERSHIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new NotFoundException('Resource not found');
    }

    const bypassRoles = options.bypassRoles ?? [];
    if (bypassRoles.includes(user.role)) return true;

    const paramName = options.paramName ?? 'id';
    const resourceOwnerId = request.params?.[paramName];

    if (resourceOwnerId && resourceOwnerId === user.userId) return true;

    throw new NotFoundException('Resource not found');
  }
}

export function assertOwner(resourceOwnerId: string, currentUser: AuthenticatedUser, bypassRoles: string[] = []): void {
  if (bypassRoles.includes(currentUser.role)) return;
  if (resourceOwnerId === currentUser.userId) return;
  throw new NotFoundException('Resource not found');
}
