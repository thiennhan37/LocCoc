import { BadRequestException, ConflictException } from '@nestjs/common';

export const DISPLAY_NAME_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeDisplayName(value: string): string {
  return value.trim().normalize('NFC');
}

export function nextDisplayNameChangeAt(lastChange: Date | null): Date | null {
  return lastChange
    ? new Date(lastChange.getTime() + DISPLAY_NAME_COOLDOWN_MS)
    : null;
}

export function planDisplayNameChange(
  current: string | null,
  lastChange: Date | null,
  requested: string,
  now: Date,
  admin = false,
): { displayName: string; lastChange: Date | null; changed: boolean } {
  const name = normalizeDisplayName(requested);
  if (!name || Array.from(name).length > 255) {
    throw new BadRequestException({
      code: 'INVALID_DISPLAY_NAME',
      message: 'Display name must contain 1 to 255 characters',
    });
  }
  const previous = current === null ? '' : normalizeDisplayName(current);
  if (previous === name) {
    return { displayName: current!, lastChange, changed: false };
  }
  const next = nextDisplayNameChangeAt(lastChange);
  if (!admin && previous && next && now.getTime() < next.getTime()) {
    throw new ConflictException({
      code: 'DISPLAY_NAME_CHANGE_TOO_SOON',
      message: 'You can change your display name once every 30 days',
      nextDisplayNameChangeAt: next.toISOString(),
    });
  }
  return {
    displayName: name,
    lastChange: admin || !previous ? lastChange : now,
    changed: true,
  };
}
