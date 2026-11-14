import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  DISPLAY_NAME_COOLDOWN_MS,
  planDisplayNameChange,
} from './display-name.policy.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

describe('Display-name policy', () => {
  const last = new Date('2026-01-31T15:00:00.000Z');
  const boundary = new Date(last.getTime() + DISPLAY_NAME_COOLDOWN_MS);

  it.each([null, '', '   '])(
    'initial name is free when the old name is %s',
    (old) => {
      expect(planDisplayNameChange(old, null, '  Tên mới  ', last)).toEqual({
        displayName: 'Tên mới',
        lastChange: null,
        changed: true,
      });
    },
  );

  it('allows a real rename immediately after free initial naming', () => {
    expect(
      planDisplayNameChange('Initial', null, 'Changed', last).lastChange,
    ).toBe(last);
  });

  it('does not count saving the same trimmed NFC name during cooldown', () => {
    expect(planDisplayNameChange('Tên', last, '  Te\u0302n  ', last)).toEqual({
      displayName: 'Tên',
      lastChange: last,
      changed: false,
    });
  });

  it.each(['Other', 'tên', 'Ten'])(
    'counts textual/case/accent change: %s',
    (name) => {
      expect(() => planDisplayNameChange('Tên', last, name, last)).toThrow(
        ConflictException,
      );
    },
  );

  it('rejects one millisecond before 30 days and reports the exact next instant', () => {
    try {
      planDisplayNameChange(
        'Old',
        last,
        'New',
        new Date(boundary.getTime() - 1),
      );
      expect.fail('Expected a cooldown conflict');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      expect((e as ConflictException).getResponse()).toMatchObject({
        code: 'DISPLAY_NAME_CHANGE_TOO_SOON',
        nextDisplayNameChangeAt: boundary.toISOString(),
      });
    }
  });

  it.each([0, 1])('allows the exact boundary and later (+%s ms)', (delta) => {
    const now = new Date(boundary.getTime() + delta);
    expect(planDisplayNameChange('Old', last, 'New', now).lastChange).toEqual(
      now,
    );
  });

  it('does not reset at a calendar month boundary', () => {
    expect(() =>
      planDisplayNameChange(
        'Old',
        last,
        'New',
        new Date('2026-02-01T00:00:00Z'),
      ),
    ).toThrow(ConflictException);
  });

  it.each([null, last])(
    'admin bypass preserves the user timestamp %s',
    (timestamp) => {
      expect(
        planDisplayNameChange('Old', timestamp, 'Admin name', last, true)
          .lastChange,
      ).toBe(timestamp);
    },
  );

  it.each(['', '  ', 'a'.repeat(256)])(
    'rejects blank/oversized names',
    (name) => {
      expect(() => planDisplayNameChange('Old', null, name, last)).toThrow(
        BadRequestException,
      );
    },
  );

  it.each([null, '', '   ', 12, 'a'.repeat(256)])(
    'validates untrusted profile input %s',
    async (name) => {
      expect(
        await validate(plainToInstance(UpdateUserDto, { displayName: name })),
      ).not.toHaveLength(0);
    },
  );

  it('permits omitted name for unrelated profile edits', async () => {
    expect(
      await validate(plainToInstance(UpdateUserDto, { phone: '123' })),
    ).toHaveLength(0);
  });
});
