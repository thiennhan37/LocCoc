import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { OTP_POLICY } from '../config/otp-policy.js';

export const OTP_STORE = Symbol('OTP_STORE');
export const OTP_SENDER = Symbol('OTP_SENDER');

export interface OtpStore {
  hset(key: string, values: Record<string, string>): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX: number }): Promise<unknown>;
}

export interface OtpSender {
  send(destination: string, code: string, channel: 'email' | 'phone'): Promise<void>;
}

/** In-memory implementation used by unit tests and as a development fallback.
 * RedisHashStore can be bound to the same OtpStore interface in production. */
export class InMemoryOtpStore implements OtpStore {
  private readonly hashes = new Map<string, { values: Record<string, string>; expiresAt?: number }>();
  private readonly values = new Map<string, { value: string; expiresAt?: number }>();

  private valid<T extends { expiresAt?: number }>(entry: T | undefined): entry is T {
    if (!entry) return false;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) return false;
    return true;
  }

  async hset(key: string, values: Record<string, string>): Promise<void> {
    const current = this.hashes.get(key);
    const record = current && this.valid(current) ? current.values : {};
    this.hashes.set(key, { values: { ...record, ...values }, expiresAt: current?.expiresAt });
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const entry = this.hashes.get(key);
    if (!this.valid(entry)) { this.hashes.delete(key); return {}; }
    return { ...entry.values };
  }

  async expire(key: string, seconds: number): Promise<void> {
    const expiry = Date.now() + seconds * 1000;
    const hash = this.hashes.get(key);
    if (hash) hash.expiresAt = expiry;
    const value = this.values.get(key);
    if (value) value.expiresAt = expiry;
  }

  async del(key: string): Promise<void> { this.hashes.delete(key); this.values.delete(key); }

  async get(key: string): Promise<string | null> {
    const entry = this.values.get(key);
    if (!this.valid(entry)) { this.values.delete(key); return null; }
    return entry.value;
  }

  async set(key: string, value: string, options?: { EX: number }): Promise<void> {
    this.values.set(key, { value, expiresAt: options?.EX ? Date.now() + options.EX * 1000 : undefined });
  }
}

/** Adapter for ioredis/node-redis clients. Kept structural so applications can
 * provide either client without coupling this service to a specific Redis lib. */
export class RedisHashStore implements OtpStore {
  constructor(private readonly client: {
    hset(key: string, values: Record<string, string>): Promise<unknown>;
    hgetall(key: string): Promise<Record<string, string>>;
    expire(key: string, seconds: number): Promise<unknown>;
    del(key: string): Promise<unknown>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  }) {}
  hset(key: string, values: Record<string, string>): Promise<unknown> { return this.client.hset(key, values); }
  hgetall(key: string): Promise<Record<string, string>> { return this.client.hgetall(key); }
  expire(key: string, seconds: number): Promise<unknown> { return this.client.expire(key, seconds); }
  del(key: string): Promise<unknown> { return this.client.del(key); }
  get(key: string): Promise<string | null> { return this.client.get(key); }
  set(key: string, value: string, options?: { EX: number }): Promise<unknown> {
    return options ? this.client.set(key, value, 'EX', options.EX) : this.client.set(key, value);
  }
}

@Injectable()
export class ConsoleOtpSender implements OtpSender {
  private readonly logger = new Logger(ConsoleOtpSender.name);
  async send(destination: string, code: string, channel: 'email' | 'phone'): Promise<void> {
    if ((process.env.NODE_ENV ?? 'development') !== 'production') {
      this.logger.log(`OTP (${channel}) for ${destination}: ${code}`);
    }
  }
}

export interface OtpIssueResult { expiresIn: number; retryAfter?: number; }

@Injectable()
export class OtpService {
  readonly policyVersion = OTP_POLICY.version;
  readonly ttlSeconds = OTP_POLICY.ttlSeconds;
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(OTP_STORE) private readonly store: OtpStore = new InMemoryOtpStore(),
    @Inject(OTP_SENDER) private readonly sender: OtpSender = new ConsoleOtpSender(),
  ) {}

  normalizeDestination(destination: string): string { return destination.trim().toLowerCase(); }

  private otpKey(destination: string): string { return `auth:otp:${this.normalizeDestination(destination)}`; }
  private resendKey(destination: string): string { return `auth:otp:resend:${this.normalizeDestination(destination)}`; }
  private ipKey(ip: string): string { return `auth:otp:resend:ip:${ip || 'unknown'}`; }

  async issue(destination: string, ip = 'unknown', channel: 'email' | 'phone' = 'email'): Promise<OtpIssueResult> {
    const normalized = this.normalizeDestination(destination);
    await this.checkAndRecordLimit(this.resendKey(normalized), OTP_POLICY.maxSendsPerHour, OTP_POLICY.resendIntervalSeconds, OTP_POLICY.windowSeconds);
    // A separate IP bucket limits attackers rotating destinations from one address.
    await this.checkAndRecordLimit(this.ipKey(ip), OTP_POLICY.ipMaxSendsPerHour, OTP_POLICY.resendIntervalSeconds, OTP_POLICY.windowSeconds);

    // Avoid the all-zero value used by clients as a common placeholder while
    // retaining a uniformly random six-digit CSPRNG-generated code.
    const code = String(randomInt(1, 1_000_000)).padStart(6, '0');
    const codeHash = createHash('sha256').update(code, 'utf8').digest('hex');
    await this.store.hset(this.otpKey(normalized), { codeHash, attempts: '0', destination: normalized });
    await this.store.expire(this.otpKey(normalized), this.ttlSeconds);
    await this.sender.send(normalized, code, channel);
    return { expiresIn: this.ttlSeconds };
  }

  private async checkAndRecordLimit(key: string, hourlyLimit: number, cooldownSeconds: number, windowSeconds: number): Promise<void> {
    const now = Date.now();
    const current = await this.store.get(key);
    const state = current ? JSON.parse(current) as { lastAt: number; windowStart: number; count: number } : undefined;
    if (state && now - state.lastAt < cooldownSeconds * 1000) {
      const retryAfter = Math.ceil((cooldownSeconds * 1000 - (now - state.lastAt)) / 1000);
      throw new Error(`OTP resend too frequent; retry in ${retryAfter}s`);
    }
    const windowStart = state && now - state.windowStart < windowSeconds * 1000 ? state.windowStart : now;
    const count = state && windowStart === state.windowStart ? state.count : 0;
    if (count >= hourlyLimit) throw new Error('OTP resend limit exceeded');
    await this.store.set(key, JSON.stringify({ lastAt: now, windowStart, count: count + 1 }), { EX: windowSeconds });
  }

  async verify(destination: string, otp: string): Promise<boolean> {
    const key = this.otpKey(destination);
    const data = await this.store.hgetall(key);
    if (!data.codeHash || !/^\d{6}$/.test(otp)) return false;
    const attempts = Number(data.attempts ?? 0);
    if (attempts >= OTP_POLICY.maxAttempts) { await this.store.del(key); return false; }
    const expected = Buffer.from(data.codeHash, 'hex');
    const actual = createHash('sha256').update(otp, 'utf8').digest();
    // timingSafeEqual được sử dụng để tránh tấn công timing attack, 
    // đảm bảo thời gian so sánh không phụ thuộc vào dữ liệu đầu vào.
    const equal = expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!equal) {
      const next = attempts + 1;
      if (next >= OTP_POLICY.maxAttempts) await this.store.del(key);
      else await this.store.hset(key, { attempts: String(next) });
      return false;
    }
    await this.store.del(key);
    return true;
  }
}




