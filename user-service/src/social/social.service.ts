import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountAuthorityClient } from '@loccoc/common';
import { SocialRepository } from './social.repository.js';
import type {
  ClaimUsernameDto,
  PageDto,
  RequestsQueryDto,
  SearchUsersDto,
} from './social.dto.js';

@Injectable()
export class SocialService {
  constructor(
    private readonly repo: SocialRepository,
    private readonly authority: AccountAuthorityClient,
  ) {}
  async syncSelf(token: string) {
    const decision = await this.authority.access(token);
    await this.repo.project(decision.account);
    return decision.account.id;
  }
  private async target(id: string, token: string): Promise<void> {
    const a = await this.authority.account(id, token);
    await this.repo.project(a);
    if (a.status !== 'active') throw new NotFoundException('User not found');
  }
  async claim(id: string, dto: ClaimUsernameDto, token: string) {
    await this.syncSelf(token);
    await this.repo.claim(id, dto.username, dto.displayName);
    return { username: dto.username };
  }
  async search(id: string, dto: SearchUsersDto) {
    await this.repo.ready(id);
    return this.repo.profiles(id, dto, 'search', dto.username);
  }
  async profile(id: string, target: string, token: string) {
    await this.repo.ready(id);
    await this.target(target, token);
    return this.repo.profile(id, target);
  }
  async profileByUsername(id: string, username: string, token: string) {
    await this.repo.ready(id);
    const profile = await this.repo.profileByUsername(id, username);
    await this.target(profile.id, token);
    return this.repo.profileByUsername(id, username);
  }
  async friends(id: string, dto: PageDto) {
    await this.repo.ready(id);
    return this.repo.profiles(id, dto, 'friends');
  }
  async requests(id: string, dto: RequestsQueryDto) {
    await this.repo.ready(id);
    return this.repo.requests(id, dto, dto.direction);
  }
  async send(id: string, target: string, token: string) {
    await this.repo.ready(id);
    await this.target(target, token);
    return this.repo.send(id, target);
  }
  async resolve(
    id: string,
    requestId: string,
    action: 'ACCEPTED' | 'REJECTED' | 'CANCELLED',
    token: string,
  ) {
    await this.repo.ready(id);
    const peer = await this.repo.requestPeer(id, requestId);
    await this.target(peer, token);
    return this.repo.resolve(id, requestId, action);
  }
  async block(id: string, target: string, token: string) {
    await this.repo.ready(id);
    await this.target(target, token);
    await this.repo.block(id, target);
  }
  async unblock(id: string, target: string) {
    await this.repo.ready(id);
    await this.repo.unblock(id, target);
  }
  async unfriend(id: string, target: string, token: string) {
    await this.repo.ready(id);
    await this.target(target, token);
    await this.repo.unfriend(id, target);
  }
  async blocks(id: string, dto: PageDto) {
    await this.repo.ready(id);
    return this.repo.blocks(id, dto);
  }
}
