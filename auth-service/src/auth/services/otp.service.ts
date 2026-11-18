import { Inject, Injectable, Optional, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomInt } from 'node:crypto';
import { deriveOtpKey, otpSecret } from '@loccoc/common';
import { OTP_POLICY } from '../config/otp-policy.js';

export const OTP_STORE = Symbol('OTP_STORE');
export const OTP_SENDER = Symbol('OTP_SENDER');
export interface OtpDeliveryContext { registrationId: string; expiresAt: string; }
export interface OtpSender {
  send(destination: string, code: string, channel: 'email' | 'phone', context?: OtpDeliveryContext): Promise<void>;
}
export interface OtpStore {
  hgetall(key: string): Promise<Record<string, string>>;
  hset(key: string, values: Record<string, string>): Promise<unknown>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX: number }): Promise<unknown>;
  reserve(destinationKey: string, ipKey: string, now: number): Promise<number>;
  putOtp(key: string, values: Record<string, string>, seconds: number): Promise<void>;
  consume(key: string, hash: string): Promise<Record<string, string> | null>;
}

/** Test implementation. Production always binds RedisHashStore. */
export class InMemoryOtpStore implements OtpStore {
  private readonly hashes = new Map<string, { values: Record<string, string>; expiresAt?: number }>();
  private readonly values = new Map<string, { value: string; expiresAt?: number }>();
  private valid<T extends { expiresAt?: number }>(entry: T | undefined): entry is T {
    return !!entry && (entry.expiresAt === undefined || entry.expiresAt > Date.now());
  }
  async hset(key: string, values: Record<string, string>): Promise<void> {
    const current = this.hashes.get(key);
    this.hashes.set(key, { values: { ...(this.valid(current) ? current.values : {}), ...values }, expiresAt: current?.expiresAt });
  }
  async hgetall(key: string): Promise<Record<string, string>> {
    const entry = this.hashes.get(key);
    return this.valid(entry) ? { ...entry.values } : {};
  }
  async expire(key: string, seconds: number): Promise<void> {
    const expiresAt = Date.now() + seconds * 1000;
    const hash = this.hashes.get(key); if (hash) hash.expiresAt = expiresAt;
    const value = this.values.get(key); if (value) value.expiresAt = expiresAt;
  }
  async del(key: string): Promise<void> { this.hashes.delete(key); this.values.delete(key); }
  async get(key: string): Promise<string | null> {
    const entry = this.values.get(key); return this.valid(entry) ? entry.value : null;
  }
  async set(key: string, value: string, options?: { EX: number }): Promise<void> {
    this.values.set(key, { value, expiresAt: options ? Date.now() + options.EX * 1000 : undefined });
  }
  async reserve(destinationKey: string, ipKey: string, now: number): Promise<number> {
    const read = (key: string) => {
      const entry = this.values.get(key);
      const value = this.valid(entry) ? JSON.parse(entry.value) as { lastAt: number; windowStart: number; count: number } : null;
      return value && now - value.windowStart < OTP_POLICY.windowSeconds * 1000 ? value : { lastAt: 0, windowStart: now, count: 0 };
    };
    const dest = read(destinationKey), ip = read(ipKey);
    const cooldown = Math.ceil((OTP_POLICY.resendIntervalSeconds * 1000 - (now - dest.lastAt)) / 1000);
    if (dest.count && cooldown > 0) return cooldown;
    if (dest.count >= OTP_POLICY.maxSendsPerHour) return Math.ceil((dest.windowStart + OTP_POLICY.windowSeconds * 1000 - now) / 1000);
    if (ip.count >= OTP_POLICY.ipMaxSendsPerHour) return Math.ceil((ip.windowStart + OTP_POLICY.windowSeconds * 1000 - now) / 1000);
    for (const [key, state] of [[destinationKey, dest], [ipKey, ip]] as const) {
      this.values.set(key, { value: JSON.stringify({ ...state, count: state.count + 1, lastAt: now }), expiresAt: state.windowStart + OTP_POLICY.windowSeconds * 1000 });
    }
    return 0;
  }
  async putOtp(key: string, values: Record<string, string>, seconds: number): Promise<void> {
    this.hashes.set(key, { values, expiresAt: Date.now() + seconds * 1000 });
  }
  async consume(key: string, hash: string): Promise<Record<string, string> | null> {
    const entry = this.hashes.get(key);
    if (!this.valid(entry) || !entry.values.codeHash) return null;
    if (entry.values.codeHash === hash) { this.hashes.delete(key); return { ...entry.values }; }
    const attempts = Number(entry.values.attempts ?? 0) + 1;
    if (attempts >= OTP_POLICY.maxAttempts) this.hashes.delete(key);
    else entry.values.attempts = String(attempts);
    return null;
  }
}

const RESERVE = `
local now=tonumber(ARGV[1]); local window=tonumber(ARGV[2]); local cooldown=tonumber(ARGV[3]);
local states={}
for i=1,2 do
 local raw=redis.call('GET',KEYS[i]); local s=raw and cjson.decode(raw) or nil
 if not s or now-s.windowStart>=window then s={lastAt=0,windowStart=now,count=0} end
 states[i]=s
end
if states[1].count>0 and now-states[1].lastAt<cooldown then return math.ceil((cooldown-now+states[1].lastAt)/1000) end
for i=1,2 do
 if states[i].count>=tonumber(ARGV[i+3]) then return math.ceil((states[i].windowStart+window-now)/1000) end
end
for i=1,2 do
 states[i].count=states[i].count+1; states[i].lastAt=now
 redis.call('SET',KEYS[i],cjson.encode(states[i]),'PX',math.max(1,states[i].windowStart+window-now))
end
return 0`;
const CONSUME = `
local expected=redis.call('HGET',KEYS[1],'codeHash')
if not expected then return false end
if expected==ARGV[1] then local values=redis.call('HGETALL',KEYS[1]); redis.call('DEL',KEYS[1]); return values end
local attempts=redis.call('HINCRBY',KEYS[1],'attempts',1)
if attempts>=tonumber(ARGV[2]) then redis.call('DEL',KEYS[1]) end
return false`;

export class RedisHashStore implements OtpStore {
  constructor(private readonly client: {
    hset(key: string, values: Record<string, string>): Promise<unknown>;
    hgetall(key: string): Promise<Record<string, string>>;
    expire(key: string, seconds: number): Promise<unknown>;
    del(key: string): Promise<unknown>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
    eval(script: string, numberOfKeys: number, ...args: (string | number)[]): Promise<unknown>;
  }) {}
  hset(key: string, values: Record<string, string>) { return this.client.hset(key, values); }
  hgetall(key: string) { return this.client.hgetall(key); }
  expire(key: string, seconds: number) { return this.client.expire(key, seconds); }
  del(key: string) { return this.client.del(key); }
  get(key: string) { return this.client.get(key); }
  set(key: string, value: string, options?: { EX: number }) { return options ? this.client.set(key, value, 'EX', options.EX) : this.client.set(key, value); }
  async reserve(destinationKey: string, ipKey: string, now: number): Promise<number> {
    return Number(await this.client.eval(RESERVE, 2, destinationKey, ipKey, now, OTP_POLICY.windowSeconds * 1000,
      OTP_POLICY.resendIntervalSeconds * 1000, OTP_POLICY.maxSendsPerHour, OTP_POLICY.ipMaxSendsPerHour));
  }
  async putOtp(key: string, values: Record<string, string>, seconds: number): Promise<void> {
    await this.client.eval(`redis.call('DEL',KEYS[1]); redis.call('HSET',KEYS[1],unpack(ARGV,2)); redis.call('EXPIRE',KEYS[1],ARGV[1]); return 1`,
      1, key, seconds, ...Object.entries(values).flat());
  }
  async consume(key: string, hash: string): Promise<Record<string, string> | null> {
    const values = await this.client.eval(CONSUME, 1, key, hash, OTP_POLICY.maxAttempts) as string[] | null;
    if (!values) return null;
    const result: Record<string, string> = {};
    for (let i = 0; i < values.length; i += 2) result[values[i]!] = values[i + 1]!;
    return result;
  }
}

export interface OtpIssueResult { expiresIn: number; retryAfter?: number; }
export interface RegistrationChallenge { email: string; accountId: string; passwordHash: string; }
@Injectable()
export class OtpService {
  readonly policyVersion = OTP_POLICY.version;
  readonly ttlSeconds = OTP_POLICY.ttlSeconds;
  private readonly hashKey?: Buffer;
  constructor(@Inject(OTP_STORE) private readonly store: OtpStore,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
    @Optional() config?: ConfigService) {
    if (config && (config.get('OTP_EVENT_SECRET') || config.get('INTERNAL_SERVICE_TOKEN'))) this.hashKey = deriveOtpKey(otpSecret(config), 'hash');
  }
  normalizeDestination(destination: string): string { return destination.trim().toLowerCase(); }
  private otpKey(destination: string, registrationId?: string): string {
    return `auth:otp:${this.normalizeDestination(destination)}${registrationId ? ':' + registrationId : ''}`;
  }
  private challengeKey(registrationId: string): string { return `auth:registration:${registrationId}`; }
  private hash(destination: string, code: string, registrationId?: string): string {
    const input = `${this.normalizeDestination(destination)}:${registrationId ?? ''}:${code}`;
    return this.hashKey ? createHmac('sha256', this.hashKey).update(input).digest('hex') : createHash('sha256').update(input).digest('hex');
  }
  async createRegistration(registrationId: string, challenge: RegistrationChallenge, ip: string): Promise<OtpIssueResult> {
    await this.store.set(this.challengeKey(registrationId), JSON.stringify(challenge), { EX: 3600 });
    return this.issue(challenge.email, ip, 'email', registrationId);
  }
  async resendRegistration(email: string, registrationId: string, ip: string): Promise<OtpIssueResult | null> {
    const challenge = await this.registration(email, registrationId);
    return challenge ? this.issue(email, ip, 'email', registrationId) : null;
  }
  private async registration(email: string, id: string): Promise<RegistrationChallenge | null> {
    const raw = await this.store.get(this.challengeKey(id));
    if (!raw) return null;
    const challenge = JSON.parse(raw) as RegistrationChallenge;
    return challenge.email === this.normalizeDestination(email) ? challenge : null;
  }
  async issue(destination: string, ip = 'unknown', channel: 'email' | 'phone' = 'email', registrationId?: string): Promise<OtpIssueResult> {
    const normalized = this.normalizeDestination(destination);
    const challenge = registrationId ? await this.registration(normalized, registrationId) : null;
    if (registrationId && !challenge) throw new HttpException('Registration expired. Please register again.', HttpStatus.BAD_REQUEST);
    const retryAfter = await this.store.reserve(`auth:otp:resend:${normalized}`, `auth:otp:resend:ip:${ip}`, Date.now());
    if (retryAfter > 0) throw new HttpException({ code: 'OTP_RATE_LIMITED', message: 'OTP resend too frequent or limit exceeded', retryAfter }, HttpStatus.TOO_MANY_REQUESTS);
    const key = this.otpKey(normalized, registrationId);
    const previous = await this.store.hgetall(key);
    let code: string;
    do { code = String(randomInt(1, 1_000_000)).padStart(6, '0'); }
    while (this.hash(normalized, code, registrationId) === previous.codeHash);
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000).toISOString();
    await this.store.putOtp(key, { codeHash: this.hash(normalized, code, registrationId), attempts: '0',
      destination: normalized, ...(challenge ?? {}) }, this.ttlSeconds);
    try { await this.sender.send(normalized, code, channel, registrationId ? { registrationId, expiresAt } : undefined); }
    catch (error) { await this.store.del(key); throw error; }
    return { expiresIn: this.ttlSeconds, retryAfter: OTP_POLICY.resendIntervalSeconds };
  }
  async verify(destination: string, otp: string): Promise<boolean> { return !!await this.consume(destination, otp); }
  private async consume(destination: string, otp: string, registrationId?: string) {
    if (!/^\d{6}$/.test(otp)) return null;
    return this.store.consume(this.otpKey(destination, registrationId), this.hash(destination, otp, registrationId));
  }
  async verifyRegistration(email: string, registrationId: string, otp: string): Promise<RegistrationChallenge | null> {
    const data = await this.consume(email, otp, registrationId);
    if (!data?.accountId || !data.passwordHash || data.email !== this.normalizeDestination(email)) return null;
    await this.store.del(this.challengeKey(registrationId));
    return { email: data.email, accountId: data.accountId, passwordHash: data.passwordHash };
  }
}
