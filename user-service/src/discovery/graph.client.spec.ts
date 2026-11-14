import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { GraphClient } from './graph.client.js';
describe('graph recommendation query stages', () => {
  it('skips three-hop expansion when two-hop candidates fill the budget', async () => {
    const graph = new GraphClient(new ConfigService());
    const candidates = Array.from({ length: 500 }, () => ({
      id: randomUUID(),
      distance: 2,
      score: 1,
    }));
    const query = vi.spyOn(graph, 'query').mockResolvedValue(candidates);
    expect(await graph.candidates(randomUUID())).toEqual(candidates);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toContain('FRIEND*2]');
  });
  it('fills only remaining slots and excludes all two-hop candidates from the three-hop query', async () => {
    const graph = new GraphClient(new ConfigService()),
      near = { id: randomUUID(), distance: 2, score: 1 },
      far = { id: randomUUID(), distance: 3, score: 20 };
    const query = vi
      .spyOn(graph, 'query')
      .mockResolvedValueOnce([near])
      .mockResolvedValueOnce([far]);
    expect(await graph.candidates(randomUUID())).toEqual([near, far]);
    expect(query.mock.calls[1]![0]).toContain('FRIEND*3]');
    expect(query.mock.calls[1]![1]).toMatchObject({
      limit: 499,
      excluded: [near.id],
    });
  });
});
