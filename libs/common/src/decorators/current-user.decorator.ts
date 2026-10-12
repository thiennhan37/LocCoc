import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.js';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, context: ExecutionContext): AuthenticatedUser | unknown => {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    return data ? request.user?.[data] : request.user;
  },
);