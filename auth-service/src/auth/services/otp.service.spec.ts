import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryOtpStore,
  OtpSender,
  OtpService,
} from './otp.service.js';

describe('OtpService', () => {
  function setup() {
    const store = new InMemoryOtpStore();
    const sent: Array<{ destination: string; code: string; channel: 'email' | 'phone' }> = [];
    const sender: OtpSender = {
      send: vi.fn(async (destination, code, channel) => {
        sent.push({ destination, code, channel });
      }),
    };
    return { store, sent, sender, service: new OtpService(store, sender) };
  }

  it('generates a six digit OTP, stores a hash, and verifies it once', async () => {
    const { service, store, sent } = setup();
    await service.issue(' User@Example.COM ', '127.0.0.1', 'email');

    expect(sent[0]?.destination).toBe('user@example.com');
    expect(sent[0]?.code).toMatch(/^\d{6}$/);
    const hash = await store.hgetall('auth:otp:user@example.com');
    expect(hash.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash.codeHash).not.toBe(sent[0]?.code);
    await expect(service.verify('USER@example.com', sent[0]!.code)).resolves.toBe(true);
    await expect(service.verify('user@example.com', sent[0]!.code)).resolves.toBe(false);
  });

  it('invalidates an OTP after five incorrect attempts', async () => {
    const { service, store, sent } = setup();
    await service.issue('person@example.com');
    const wrongCode = sent[0]!.code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i += 1) {
      await expect(service.verify('person@example.com', wrongCode)).resolves.toBe(false);
    }
    await expect(store.hgetall('auth:otp:person@example.com')).resolves.toEqual({});
    await expect(service.verify('person@example.com', sent[0]!.code)).resolves.toBe(false);
  });

  it('expires OTPs after five minutes', async () => {
    vi.useFakeTimers();
    try {
      const { service, sent } = setup();
      await service.issue('expires@example.com');
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      await expect(service.verify('expires@example.com', sent[0]!.code)).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('enforces resend cooldown and per-destination hourly limit', async () => {
    const { service } = setup();
    await service.issue('resend@example.com', '10.0.0.1');
    await expect(service.issue('resend@example.com', '10.0.0.1')).rejects.toThrow(/frequent/i);

    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(60_001);
      for (let i = 0; i < 4; i += 1) {
        await service.issue('resend@example.com', `10.0.0.${i + 2}`);
        vi.advanceTimersByTime(60_001);
      }
      await expect(service.issue('resend@example.com', '10.0.0.9')).rejects.toThrow(/limit exceeded/i);
    } finally {
      vi.useRealTimers();
    }
  });
});
