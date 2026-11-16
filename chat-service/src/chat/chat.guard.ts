import { CanActivate, ExecutionContext, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AccountAuthorityClient, type AuthenticatedUser, type RequestWithId } from '@loccoc/common';
import { isUUID } from 'class-validator';

export type ChatRequest = RequestWithId & { user: AuthenticatedUser };
@Injectable()
export class ChatGuard implements CanActivate {
  constructor(@Inject(AccountAuthorityClient) private readonly authority: AccountAuthorityClient) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ChatRequest>();
    if (request.method === 'GET' && request.path === '/health') return true;
    const access = await this.authority.access(request.headers.authorization ?? '');
    if (!isUUID(access?.user?.userId) || access.user.userId !== access.account?.id) throw new ServiceUnavailableException('Invalid account verification response');
    request.user = access.user;
    return true;
  }
}
