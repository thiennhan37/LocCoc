import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decryptEmailOtp, encryptEmailOtp, parseEmailOtpEvent, redact } from '@loccoc/common';
import { BrevoEmailSender, EmailDeliveryError } from '../src/brevo-email.sender.js';
import { EmailOtpRepository } from '../src/email-otp.repository.js';
import type { DataSource } from 'typeorm';

const secret = 'test-only-email-event-secret-1234567890';
const payload = () => ({ email: 'owner@example.test', code: '123456', registrationId: randomUUID(), expiresAt: new Date(Date.now() + 300000).toISOString() });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('encrypted email OTP contract', () => {
  it('hides email and code and authenticates metadata and ciphertext', () => {
    const data = payload(), event = encryptEmailOtp(data, secret);
    expect(JSON.stringify(event)).not.toContain(data.email);
    expect(JSON.stringify(event)).not.toContain(data.code);
    expect(decryptEmailOtp(event, secret)).toEqual(data);
    expect(() => decryptEmailOtp({ ...event, aggregateId: randomUUID() }, secret)).toThrow();
    expect(() => decryptEmailOtp(event, secret + 'wrong')).toThrow();
    expect(() => decryptEmailOtp({ ...event, data: { ...event.data, tag: Buffer.alloc(16).toString('base64') } }, secret)).toThrow();
  });
  it('rejects malformed or excessive-lifetime envelopes', () => {
    const event = encryptEmailOtp(payload(), secret);
    expect(() => parseEmailOtpEvent(null)).toThrow();
    expect(() => parseEmailOtpEvent({ ...event, version: 2 })).toThrow();
    expect(() => parseEmailOtpEvent({ ...event, expiresAt: new Date(Date.now() + 600000).toISOString() })).toThrow();
    expect(() => parseEmailOtpEvent({ ...event, data: { ...event.data, ciphertext: 'x'.repeat(4097) } })).toThrow();
  });
  it('redacts delivery secrets and OTP/password fields', () => {
    expect(redact({ BREVO_MAIL_API_KEY: 'provider-key', OTP_EVENT_SECRET: 'shared-secret', passwordHash: 'hash', otp: '123456', code: '123456', 'api-key': 'provider-key' }))
      .toEqual({ BREVO_MAIL_API_KEY: '[REDACTED]', OTP_EVENT_SECRET: '[REDACTED]', passwordHash: '[REDACTED]', otp: '[REDACTED]', code: '[REDACTED]', 'api-key': '[REDACTED]' });
  });
});

describe('Brevo OTP sender', () => {
  const config = () => new ConfigService({ BREVO_MAIL_API_KEY: 'test-api-key', BREVO_SENDER_EMAIL: 'sender@example.test' });
  it('sends a transactional email with a stable provider idempotency key', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetcher);
    const data = payload(), id = randomUUID();
    await new BrevoEmailSender(config()).send(data, id);
    const [url, request] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(request.headers['api-key']).toBe('test-api-key');
    const body = JSON.parse(request.body);
    expect(body.to).toEqual([{ email: data.email }]);
    expect(body.textContent).toContain(data.code);
    expect(body.textContent).toContain(data.registrationId.slice(0, 8));
    expect(body.headers.idempotencyKey).toBe(id);
    expect(body).not.toHaveProperty('password');
  });
  it('uses a single verified sender when only the root API key is configured', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ senders: [{ email: 'verified@example.test', active: true }, { email: 'pending@example.test', active: false }] })))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetcher);
    await new BrevoEmailSender(new ConfigService({ BREVO_MAIL_API_KEY: 'key' })).send(payload(), randomUUID());
    expect(fetcher.mock.calls[0]![0]).toBe('https://api.brevo.com/v3/senders');
    expect(JSON.parse(fetcher.mock.calls[1]![1].body).sender.email).toBe('verified@example.test');
  });
  it('does not guess between multiple verified senders', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ senders: [
      { email: 'one@example.test', active: true }, { email: 'two@example.test', active: true },
    ] })));
    vi.stubGlobal('fetch', fetcher);
    await expect(new BrevoEmailSender(new ConfigService({ BREVO_MAIL_API_KEY: 'key' })).send(payload(), randomUUID()))
      .rejects.toBeInstanceOf(EmailDeliveryError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([429, 500, 401, 403])('retries provider HTTP %s without exposing its body', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider response', { status, headers: { 'retry-after': '30' } })));
    await expect(new BrevoEmailSender(config()).send(payload(), randomUUID())).rejects.toMatchObject({ retryable: true, retryAfterSeconds: 30, message: 'Email delivery unavailable' });
  });
  it('rejects permanent provider failures and wraps network failures', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('private', { status: 400 })).mockRejectedValueOnce(new Error('private transport error'));
    vi.stubGlobal('fetch', fetcher);
    const sender = new BrevoEmailSender(config());
    await expect(sender.send(payload(), randomUUID())).rejects.toMatchObject({ retryable: false });
    await expect(sender.send(payload(), randomUUID())).rejects.toMatchObject({ retryable: true, message: 'Email delivery unavailable' });
  });
  it('never sends expired OTPs', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await new BrevoEmailSender(config()).send({ ...payload(), expiresAt: new Date(Date.now() - 1).toISOString() }, randomUUID());
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('email OTP worker jobs', () => {
  function setup(event = encryptEmailOtp(payload(), secret)) {
    const query = vi.fn().mockResolvedValue(undefined);
    query.mockResolvedValueOnce([{ event_id: event.eventId, event, attempts: 0 }]);
    const db = { transaction: (fn: (m: { query: typeof query }) => unknown) => fn({ query }) } as unknown as DataSource;
    const send = vi.fn().mockResolvedValue(undefined);
    return { query, send, repo: new EmailOtpRepository(db, { send } as unknown as BrevoEmailSender) };
  }
  it('marks acknowledged mail complete using the event id', async () => {
    const { repo, query, send } = setup(); await repo.deliver(secret);
    expect(send).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("result='sent'"))).toBe(true);
  });
  it('keeps a failed delivery eligible for retry', async () => {
    const { repo, query, send } = setup(); send.mockRejectedValue(new EmailDeliveryError(true, 30));
    await repo.deliver(secret);
    const update = query.mock.calls.find(([sql]) => String(sql).includes('next_attempt_at=now()'))!;
    expect(update[1]).toEqual([expect.any(String), 30, true]);
  });
  it('rejects a tampered ciphertext without calling Brevo', async () => {
    const event = encryptEmailOtp(payload(), secret); event.data.tag = Buffer.alloc(16).toString('base64');
    const { repo, query, send } = setup(event); await repo.deliver(secret);
    expect(send).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => String(sql).includes("result='invalid'"))).toBe(true);
  });
});
