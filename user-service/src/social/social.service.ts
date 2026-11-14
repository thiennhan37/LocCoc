import { DiscoveryService } from '../discovery/discovery.service.js';
import { DiscoveryRuntime } from '../discovery/discovery.runtime.js';
import {
  Injectable,
  NotFoundException,
  Optional,
  BadRequestException,
} from '@nestjs/common';
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
    @Optional() private readonly discovery?: DiscoveryService,
    @Optional() private readonly discoveryRuntime?: DiscoveryRuntime,
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
    if (dto.q !== undefined) {
      if (dto.username !== undefined || !this.discovery)
        throw new BadRequestException('Use either q or username');
      return this.discovery.search(id, {
        q: dto.q,
        limit: dto.limit,
        cursor: dto.cursor,
      });
    }
    if (dto.cursor) throw new BadRequestException('Cursor requires q');
    return this.repo.profiles(id, dto, 'search', dto.username);
  }
  async profile(id: string, target: string, token: string) {
    await this.repo.ready(id);
    await this.target(target, token);
    const profile = await this.repo.profile(id, target);
    return this.discovery
      ? (
          await this.discovery.enrich(
            id,
            [profile],
            this.discoveryRuntime?.mutualAvailable ?? false,
          )
        )[0]!
      : profile;
  }
  async profileByUsername(id: string, username: string, token: string) {
    await this.repo.ready(id);
    const profile = await this.repo.profileByUsername(id, username);
    await this.target(profile.id, token);
    const current = await this.repo.profileByUsername(id, username);
    return this.discovery && current.id !== id
      ? (
          await this.discovery.enrich(
            id,
            [current],
            this.discoveryRuntime?.mutualAvailable ?? false,
          )
        )[0]!
      : current;
  }
  async friends(id: string, dto: PageDto) {
    await this.repo.ready(id);
    return this.repo.profiles(id, dto, 'friends');
  }
  async summary(id: string) {
    await this.repo.ready(id);
    return this.repo.summary(id);
  }
  async requests(id: string, dto: RequestsQueryDto) {
    await this.repo.ready(id);
    return this.repo.requests(id, dto, dto.direction);
  }
  async requestDetail(id: string, requestId: string, token: string) {
    await this.repo.ready(id);
    const peer = await this.repo.requestPeer(id, requestId);
    await this.target(peer, token);
    await this.repo.profile(id, peer);
    return this.repo.requestDetail(id, requestId);
  }
  async send(id: string, target: string, token: string) {
    await this.repo.ready(id);
    await this.target(target, token);
    const result = await this.repo.send(id, target);
    await this.discoveryRuntime?.prunePair(id, target);
    return result;
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
    const result = await this.repo.resolve(id, requestId, action);
    await this.discoveryRuntime?.prunePair(id, peer);
    return result;
  }
  async block(id: string, target: string, token: string) {
    await this.repo.ready(id);
    await this.target(target, token);
    await this.repo.block(id, target);
    await this.discoveryRuntime?.prunePair(id, target);
  }
  async unblock(id: string, target: string) {
    await this.repo.ready(id);
    await this.repo.unblock(id, target);
    await this.discoveryRuntime?.prunePair(id, target);
  }
  async unfriend(id: string, target: string, token: string) {
    await this.repo.ready(id);
    await this.target(target, token);
    await this.repo.unfriend(id, target);
    await this.discoveryRuntime?.prunePair(id, target);
  }
  async blocks(id: string, dto: PageDto) {
    await this.repo.ready(id);
    return this.repo.blocks(id, dto);
  }
}
