import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DiscoveryService } from './discovery.service.js';
import type { DiscoveryRepository } from './discovery.repository.js';
import type { DiscoveryRuntime } from './discovery.runtime.js';
import type { GraphClient } from './graph.client.js';
import type { SocialRepository } from '../social/social.repository.js';
import { parseGraphSnapshot, type GraphCandidate } from './graph.client.js';

function fixture() {
  const repo = {
    normalize: vi.fn().mockResolvedValue('nguyen'),
    globalSearchIds: vi.fn().mockResolvedValue(['target']),
    rankSearchIds: vi.fn().mockResolvedValue(['target']),
    createSession: vi.fn().mockResolvedValue('session:0'),
    page: vi.fn().mockResolvedValue({
      data: [{ id: 'target' }],
      hasMore: false,
      nextCursor: null,
      degraded: false,
    }),
    enqueue: vi.fn(),
    mutual: vi.fn().mockResolvedValue({
      state: 'available',
      count: 1,
      data: [{ id: 'bridge' }],
    }),
  };
  const social = {
    ready: vi.fn(),
    summary: vi.fn().mockResolvedValue({ friendCount: 1 }),
    profile: vi.fn(),
  };
  const graph = {
    candidates: vi.fn<() => Promise<GraphCandidate[]>>().mockResolvedValue([]),
    mutualCandidates: vi.fn().mockResolvedValue({ target: ['bridge'] }),
  };
  const runtime = {
    fresh: true,
    mutualAvailable: true,
    markGraphFailure: vi.fn(),
    cache: vi
      .fn<() => Promise<{ ids: string[] } | null>>()
      .mockResolvedValue({ ids: ['target'] }),
  };
  const service = new DiscoveryService(
    repo as unknown as DiscoveryRepository,
    social as unknown as SocialRepository,
    graph as unknown as GraphClient,
    runtime as unknown as DiscoveryRuntime,
    null,
  );
  return { service, repo, social, graph, runtime };
}
describe('discovery degradation boundaries', () => {
  it('retrieves global text candidates once and ranks the merged graph branch once', async () => {
    const f = fixture();
    f.graph.candidates.mockResolvedValueOnce([
      { id: 'nearby', distance: 2, score: 1 },
    ]);
    await f.service.search('viewer', { q: 'Nguyễn', limit: 20 });
    expect(f.repo.globalSearchIds).toHaveBeenCalledTimes(1);
    expect(f.repo.rankSearchIds).toHaveBeenCalledExactlyOnceWith(
      'viewer',
      'nguyen',
      ['target'],
      [{ id: 'nearby', distance: 2, score: 1 }],
    );
  });
  it('removes a result that becomes blocked during final mutual hydration', async () => {
    const f = fixture();
    f.repo.mutual.mockRejectedValueOnce(
      new NotFoundException('User not found'),
    );
    expect(
      (await f.service.search('viewer', { q: 'Nguyễn', limit: 20 })).data,
    ).toEqual([]);
  });
  it('marks search degraded when graph mutual lookup fails after candidate retrieval', async () => {
    const f = fixture();
    f.graph.mutualCandidates.mockRejectedValueOnce(new Error('offline'));
    f.runtime.markGraphFailure.mockImplementation(() => {
      f.runtime.mutualAvailable = false;
    });
    const result = await f.service.search('viewer', { q: 'Nguyễn', limit: 20 });
    expect(result.degraded).toBe(true);
    expect(result.data[0]?.mutual?.count).toBeNull();
  });
  it('preserves PostgreSQL search and hides mutual evidence on graph failure', async () => {
    const f = fixture();
    f.graph.candidates.mockRejectedValue(new Error('graph offline'));
    f.runtime.markGraphFailure.mockImplementation(() => {
      f.runtime.mutualAvailable = false;
    });
    const result = await f.service.search('viewer', { q: 'Nguyễn', limit: 20 });
    expect(result.degraded).toBe(true);
    expect(result.data[0]).toMatchObject({
      id: 'target',
      mutual: { state: 'unavailable', count: null, data: [] },
    });
  });
  it('preserves text search with a local rate limit when Redis is unavailable', async () => {
    const f = fixture();
    f.runtime.mutualAvailable = false;
    expect(
      (await f.service.search('viewer', { q: 'Nguyễn', limit: 20 })).data,
    ).toHaveLength(1);
    expect(f.graph.candidates).not.toHaveBeenCalled();
    for (let i = 1; i < 60; i++)
      await f.service.search('viewer', { q: 'Nguyễn', limit: 20 });
    await expect(
      f.service.search('viewer', { q: 'Nguyễn', limit: 20 }),
    ).rejects.toMatchObject({ status: 429 });
  });
  it('uses valid cached suggestions during graph outage within the serving budget', async () => {
    const f = fixture();
    f.runtime.mutualAvailable = false;
    const result = await f.service.recommendations('viewer', { limit: 20 });
    expect(result.state).toBe('ready');
    expect(result.data[0]?.mutual?.state).toBe('unavailable');
  });
  it('shows maintenance on excessive lag and never reads cached candidates', async () => {
    const f = fixture();
    f.runtime.fresh = false;
    expect(
      (await f.service.recommendations('viewer', { limit: 20 })).state,
    ).toBe('maintenance');
    expect(f.runtime.cache).not.toHaveBeenCalled();
  });
  it('shows maintenance on Redis failure but propagates final database failures', async () => {
    const f = fixture();
    f.runtime.cache.mockRejectedValueOnce(new Error('redis offline'));
    expect(
      (await f.service.recommendations('viewer', { limit: 20 })).state,
    ).toBe('maintenance');
    f.repo.page.mockRejectedValueOnce(new Error('PostgreSQL offline'));
    await expect(
      f.service.recommendations('viewer', { limit: 20 }),
    ).rejects.toThrow('PostgreSQL offline');
  });
  it('queues missing caches without synchronous graph traversal', async () => {
    const f = fixture();
    f.runtime.cache.mockResolvedValueOnce(null);
    expect(
      (await f.service.recommendations('viewer', { limit: 20 })).state,
    ).toBe('preparing');
    expect(f.repo.enqueue).toHaveBeenCalledWith('viewer');
    expect(f.graph.candidates).not.toHaveBeenCalled();
  });
  it('returns cold-start guidance for users without friends', async () => {
    const f = fixture();
    f.social.summary.mockResolvedValue({ friendCount: 0 });
    expect(
      (await f.service.recommendations('viewer', { limit: 20 })).state,
    ).toBe('cold_start');
  });
  it('checks blocked profiles before reporting mutual service availability', async () => {
    const f = fixture();
    f.runtime.mutualAvailable = false;
    f.social.profile.mockRejectedValue(new Error('404'));
    await expect(
      f.service.mutual('viewer', 'target', { limit: 20 }),
    ).rejects.toThrow('404');
    expect(f.repo.mutual).not.toHaveBeenCalled();
  });
  it('rejects unsupported graph versions, malformed booleans and wrong partition keys', () => {
    const e = {
      eventType: 'USER_PROFILE_SNAPSHOT',
      version: 1,
      userId: '11111111-1111-4111-8111-111111111111',
      profileVersion: 2,
      username: 'alice',
      displayNameNorm: 'alice',
      recommendable: true,
      mutualVisibility: false,
    };
    expect(parseGraphSnapshot(e, e.userId)).toMatchObject(e);
    expect(() => parseGraphSnapshot({ ...e, version: 2 })).toThrow();
    expect(() =>
      parseGraphSnapshot({ ...e, mutualVisibility: 'false' }),
    ).toThrow();
    expect(() => parseGraphSnapshot(e, 'other')).toThrow();
  });
});
