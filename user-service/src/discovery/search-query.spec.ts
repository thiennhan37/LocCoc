import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { SearchUsersDto } from '../social/social.dto.js';
import { normalizeSearchQuery } from './search-query.js';
describe('canonical discovery query', () => {
  it.each(['@a', '@@ab', '   '])(
    'rejects %j after canonicalization',
    async (q) => {
      expect(
        await validate(plainToInstance(SearchUsersDto, { q })),
      ).not.toEqual([]);
    },
  );
  it.each([
    ['  @ab  ', 'ab'],
    ['Nguyễn   Đặng', 'Nguyễn Đặng'],
    [' Nguyễn   Đặng ', 'Nguyễn Đặng'],
  ])('validates and normalizes %j once', async (q, expected) => {
    const dto = plainToInstance(SearchUsersDto, { q });
    expect(await validate(dto)).toEqual([]);
    expect(dto.q).toBe(expected);
    expect(normalizeSearchQuery(dto.q!)).toBe(expected);
  });
});
