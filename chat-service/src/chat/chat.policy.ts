import { ForbiddenException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SafePeer, PostAttachment } from './chat.types.js';

@Injectable()
export class ChatPolicy {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}
  async postAttachment(authorization: string, postId: string, peerId: string): Promise<PostAttachment> {
    let response: Response;
    try {
      response = await fetch(`${this.config.getOrThrow<string>('POST_SERVICE_URL').replace(/\/$/, '')}/posts/${encodeURIComponent(postId)}/chat-reference`, {
        headers: { authorization }, redirect: 'error', signal: AbortSignal.timeout(5000),
      });
    } catch { throw new ServiceUnavailableException('Post verification unavailable'); }
    if (response.status === 401) throw new UnauthorizedException('Authentication required');
    if (response.status === 403 || response.status === 404) throw unavailable();
    if (!response.ok) throw new ServiceUnavailableException('Post verification unavailable');
    let data: Record<string, unknown>;
    try { data = await response.json() as Record<string, unknown>; }
    catch { throw new ServiceUnavailableException('Invalid post reference'); }
    if (!data || data.postId !== postId || data.ownerId !== peerId) throw unavailable();
    if (typeof data.mediaKey !== 'string' || !/^\/posts\/media\/[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/.test(data.mediaKey))
      throw new ServiceUnavailableException('Invalid post reference');
    return { postId, mediaKey: data.mediaKey };
  }
  async profile(authorization: string, peerId: string): Promise<SafePeer> {
    let response: Response;
    try {
      response = await fetch(`${this.config.getOrThrow<string>('USER_SERVICE_URL').replace(/\/$/, '')}/users/profiles/${encodeURIComponent(peerId)}`, {
        headers: { authorization }, redirect: 'error', signal: AbortSignal.timeout(5000),
      });
    } catch { throw new ServiceUnavailableException('Friendship verification unavailable'); }
    if (response.status === 401) throw new UnauthorizedException('Authentication required');
    if (response.status === 403 || response.status === 404) throw unavailable();
    if (!response.ok) throw new ServiceUnavailableException('Friendship verification unavailable');
    let data: Record<string, unknown>;
    try { data = await response.json() as Record<string, unknown>; }
    catch { throw new ServiceUnavailableException('Invalid friendship response'); }
    if (!data || data.id !== peerId || typeof data.username !== 'string') throw new ServiceUnavailableException('Invalid friendship response');
    if (data.relationshipStatus !== 'FRIENDS') throw unavailable();
    return { id: peerId, username: data.username, displayName: typeof data.displayName === 'string' ? data.displayName : null, avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null };
  }
}
function unavailable() { return new ForbiddenException({ code: 'CHAT_UNAVAILABLE', message: 'Conversation cannot accept new interactions' }); }
