import { Injectable, Optional, HttpException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '@loccoc/common';
import type { Redis } from 'ioredis';
import { isUUID } from 'class-validator';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  SocialRepository,
  type SafeProfile,
} from '../social/social.repository.js';
import {
  DiscoveryRepository,
  type DiscoveryProfile,
  type MutualEvidence,
} from './discovery.repository.js';
import { DiscoveryRuntime } from './discovery.runtime.js';
import { GraphClient, type GraphCandidate } from './graph.client.js';
import type {
  DiscoveryPageDto,
  DiscoverySearchDto,
  PrivacyDto,
} from './discovery.dto.js';

const unavailable: MutualEvidence = {
  state: 'unavailable',
  count: null,
  data: [],
};
@Injectable()
export class DiscoveryService {
  private readonly localLimits = new Map<
    string,
    { count: number; until: number }
  >();
  constructor(
    private readonly repo: DiscoveryRepository,
    private readonly social: SocialRepository,
    private readonly graph: GraphClient,
    private readonly runtime: DiscoveryRuntime,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis | null,
  ) {}
  private async rate(id: string) {
    // Redis failure must preserve text search, with a bounded local limiter.
    let count: number;
    try {
      if (!this.redis) throw new Error('Redis unavailable');
      count = Number(
        await this.redis.eval(
          `local n=redis.call('INCR',KEYS[1]);
        if n==1 then redis.call('EXPIRE',KEYS[1],60) end;return n`,
          1,
          `discovery:search:${id}`,
        ),
      );
    } catch {
      const now = Date.now();
      for (const [key, value] of this.localLimits)
        if (value.until <= now) this.localLimits.delete(key);
      const value = this.localLimits.get(id) ?? {
        count: 0,
        until: now + 60000,
      };
      if (this.localLimits.size >= 10000 && !this.localLimits.has(id))
        throw new HttpException('Too many searches', 429);
      value.count++;
      this.localLimits.set(id, value);
      count = value.count;
    }
    if (count > 60) throw new HttpException('Too many searches', 429);
  }
  async search(id: string, dto: DiscoverySearchDto) {
    await this.social.ready(id);
    await this.rate(id);
    const term = await this.repo.normalize(dto.q);
    if (term.length < 2)
      throw new BadRequestException('Enter at least two characters');
    let cursor = dto.cursor;
    if (!cursor) {
      let degraded = !this.runtime.mutualAvailable;
      const [global, graph] = await Promise.allSettled([
        this.repo.globalSearchIds(id, term),
        degraded
          ? Promise.resolve<GraphCandidate[]>([])
          : this.graph.candidates(id, term),
      ]);
      if (global.status === 'rejected') throw global.reason;
      if (graph.status === 'rejected') {
        degraded = true;
        this.runtime.markGraphFailure();
      }
      const graphCandidates = graph.status === 'fulfilled' ? graph.value : [];
      const ids = await this.repo.rankSearchIds(
        id,
        term,
        global.value,
        graphCandidates,
      );
      cursor = await this.repo.createSession(id, term, ids, degraded);
    }
    const result = await this.repo.page(id, term, cursor, dto.limit);
    const data = await this.enrich(
      id,
      result.data,
      this.runtime.mutualAvailable,
    );
    return {
      ...result,
      data,
      degraded: result.degraded || !this.runtime.mutualAvailable,
    };
  }
  async recommendations(id: string, dto: DiscoveryPageDto) {
    await this.social.ready(id);
    const summary = await this.social.summary(id);
    if (!summary.friendCount)
      return {
        data: [],
        hasMore: false,
        nextCursor: null,
        state: 'cold_start',
      };
    if (!this.runtime.fresh)
      return {
        data: [],
        hasMore: false,
        nextCursor: null,
        state: 'maintenance',
      };
    let cache;
    try {
      cache = await this.runtime.cache(id);
    } catch {
      return {
        data: [],
        hasMore: false,
        nextCursor: null,
        state: 'maintenance',
      };
    }
    if (!cache) {
      await this.repo.enqueue(id);
      return { data: [], hasMore: false, nextCursor: null, state: 'preparing' };
    }
    const cursor =
      dto.cursor ??
      (await this.repo.createSession(
        id,
        '__recommendations',
        cache.ids,
        false,
      ));
    const page = await this.repo.page(
      id,
      '__recommendations',
      cursor,
      dto.limit,
      true,
    );
    if (page.data.length < dto.limit) await this.repo.enqueue(id, 1);
    return {
      ...page,
      data: await this.enrich(id, page.data, this.runtime.mutualAvailable),
      state: 'ready',
    };
  }
  async enrich(
    id: string,
    profiles: SafeProfile[],
    available: boolean,
  ): Promise<DiscoveryProfile[]> {
    if (!available)
      return profiles.map((p) => ({ ...p, mutual: { ...unavailable } }));
    let candidates: Record<string, string[]>;
    try {
      candidates = await this.graph.mutualCandidates(
        id,
        profiles.map((p) => p.id),
      );
    } catch {
      this.runtime.markGraphFailure();
      return profiles.map((p) => ({ ...p, mutual: { ...unavailable } }));
    }
    // Graph supplies identities; PostgreSQL verifies supporting relationships
    // and computes exact permitted counts, independently of projection lag.
    const hydrated = await Promise.all(
      profiles.map(async (p) => {
        try {
          return {
            ...p,
            mutual: await this.repo.mutual(
              id,
              p.id,
              3,
              undefined,
              candidates[p.id] ?? [],
            ),
          };
        } catch (e) {
          // Visibility may change after the candidate-page snapshot. Remove only
          // that result, while retaining failure propagation for database errors.
          if (e instanceof NotFoundException) return null;
          throw e;
        }
      }),
    );
    return hydrated.filter((p): p is NonNullable<typeof p> => p !== null);
  }
  async mutual(id: string, target: string, dto: DiscoveryPageDto) {
    await this.social.ready(id);
    // Check visibility/block before reporting dependency status.
    await this.social.profile(id, target);
    if (dto.cursor && !isUUID(dto.cursor))
      throw new BadRequestException('Invalid cursor');
    const privacy = await this.repo.privacy(target);
    if (!privacy.mutualVisibility)
      return this.repo.mutual(id, target, dto.limit, dto.cursor);
    if (!this.runtime.mutualAvailable)
      return { ...unavailable, hasMore: false, nextCursor: null };
    let candidates: Record<string, string[]>;
    try {
      candidates = await this.graph.mutualCandidates(id, [target]);
    } catch {
      this.runtime.markGraphFailure();
      return { ...unavailable, hasMore: false, nextCursor: null };
    }
    return this.repo.mutual(
      id,
      target,
      dto.limit,
      dto.cursor,
      candidates[target] ?? [],
    );
  }
  async privacy(id: string) {
    await this.social.ready(id);
    return this.repo.privacy(id);
  }
  async setPrivacy(id: string, patch: PrivacyDto) {
    await this.social.ready(id);
    const result = await this.repo.setPrivacy(id, patch);
    await this.runtime.invalidate(id);
    await this.repo.enqueue(id);
    return result;
  }
  async dismiss(id: string, target: string) {
    await this.social.ready(id);
    await this.repo.dismiss(id, target);
    await this.runtime.pruneCandidate(id, target);
    await this.repo.enqueue(id);
  }
}
