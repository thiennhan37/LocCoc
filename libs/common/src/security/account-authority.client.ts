import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.js';

export interface AccountSnapshot {
  id: string;
  email: string;
  phone: string | null;
  status: 'pending_verification' | 'active' | 'suspended' | 'deleted';
  version: number;
}
export interface AccessDecision {
  user: AuthenticatedUser;
  account: AccountSnapshot;
}

@Injectable()
export class AccountAuthorityClient {
  constructor(private readonly config: ConfigService) {}

  async call<T>(
    path: string,
    authorization: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(
        `${this.config.get<string>('AUTH_SERVICE_URL', 'http://127.0.0.1:8000')}/internal/${path}`,
        {
          method,
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
          headers: {
            authorization,
            'x-service-token': this.config.getOrThrow<string>(
              'INTERNAL_SERVICE_TOKEN',
            ),
            'content-type': 'application/json',
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
    } catch {
      throw new ServiceUnavailableException('Account verification unavailable');
    }
    if (response.status === 401)
      throw new UnauthorizedException('Authentication required');
    if (response.status === 403)
      throw new ForbiddenException({
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'Account is unavailable',
      });
    if (response.status === 404) throw new NotFoundException('User not found');
    if (!response.ok)
      throw new ServiceUnavailableException('Account verification unavailable');
    try {
      return (await response.json()) as T;
    } catch {
      throw new ServiceUnavailableException(
        'Invalid account verification response',
      );
    }
  }

  access(authorization: string): Promise<AccessDecision> {
    if (!/^Bearer \S+$/.test(authorization))
      throw new UnauthorizedException('Authentication required');
    return this.call('access', authorization);
  }
  account(id: string, authorization: string): Promise<AccountSnapshot> {
    return this.call(`accounts/${encodeURIComponent(id)}`, authorization);
  }
}
