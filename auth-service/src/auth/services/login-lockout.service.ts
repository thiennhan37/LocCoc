import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const LOCKOUT_STORE = Symbol('LOCKOUT_STORE');

export interface LockoutRecord {
  count: number;
  lockedUntil: number;
}

export interface LockoutStore {
  get(key: string): Promise<LockoutRecord | null>;
  set(key: string, record: LockoutRecord, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

/** In-memory store used by unit/e2e tests and as a local fallback. */
export class InMemoryLockoutStore implements LockoutStore {
  private readonly store = new Map<string, { record: LockoutRecord; expiresAt: number }>();

  async get(key: string): Promise<LockoutRecord | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.record;
  }

  async set(key: string, record: LockoutRecord, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      record,
      expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/** Redis adapter for persistent, distributed login lockout state. */
export class RedisLockoutStore implements LockoutStore {
  constructor(
    private readonly client: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
      del(key: string): Promise<unknown>;
    },
  ) {}

  private prefixKey(key: string): string {
    return `auth:lockout:${key}`;
  }

  async get(key: string): Promise<LockoutRecord | null> {
    const raw = await this.client.get(this.prefixKey(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LockoutRecord;
    } catch {
      return null;
    }
  }

  async set(key: string, record: LockoutRecord, ttlSeconds: number): Promise<void> {
    const safeTtl = Math.max(1, Math.ceil(ttlSeconds));
    await this.client.set(this.prefixKey(key), JSON.stringify(record), 'EX', safeTtl);
  }

  async del(key: string): Promise<void> {
    await this.client.del(this.prefixKey(key));
  }
}

@Injectable()
export class LoginLockoutService {
  readonly maxAttempts: number;
  readonly baseLockSeconds: number;
  readonly maxLockSeconds: number;

  constructor(
    @Inject(LOCKOUT_STORE) private readonly store: LockoutStore,
    @Optional() config?: ConfigService,
  ) {
    this.maxAttempts = Number(config?.get('LOGIN_MAX_ATTEMPTS')) || 5;
    this.baseLockSeconds = Number(config?.get('LOGIN_LOCK_BASE_SECONDS')) || 60;
    this.maxLockSeconds = Number(config?.get('LOGIN_LOCK_MAX_SECONDS')) || 900;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private getPairKey(email: string, ip: string): string {
    return `pair:${this.normalizeEmail(email)}|${ip || 'unknown'}`;
  }

  private getAccountKey(email: string): string {
    return `account:${this.normalizeEmail(email)}`;
  }

  private calculateLock(count: number): { lockedUntil: number; ttlSeconds: number } {
    if (count < this.maxAttempts) {
      return { lockedUntil: 0, ttlSeconds: this.maxLockSeconds };
    }
    const backoffSeconds = Math.min(
      this.maxLockSeconds,
      this.baseLockSeconds * 2 ** Math.min(count - this.maxAttempts, 10),
    );
    const lockedUntil = Date.now() + backoffSeconds * 1000;
    // Giữ key trong Redis ít nhất maxLockSeconds để lưu lịch sử số lần sai (count)
    // không bị Redis xóa mất sau khi thời gian khóa tạm thời kết thúc
    const ttlSeconds = Math.max(this.maxLockSeconds, backoffSeconds);
    return { lockedUntil, ttlSeconds };
  }

  private async incrementKey(key: string): Promise<void> {
    const previous = await this.store.get(key);
    const count = (previous?.count ?? 0) + 1;
    const { lockedUntil, ttlSeconds } = this.calculateLock(count);
    await this.store.set(key, { count, lockedUntil }, ttlSeconds);
  }

  async isLocked(email: string, ip: string): Promise<boolean> {
    const now = Date.now();
    const [pairRecord, accountRecord] = await Promise.all([
      this.store.get(this.getPairKey(email, ip)),
      this.store.get(this.getAccountKey(email)),
    ]);

    if (pairRecord && pairRecord.lockedUntil > now) return true;
    if (accountRecord && accountRecord.lockedUntil > now) return true;
    return false;
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    await Promise.all([
      this.incrementKey(this.getPairKey(email, ip)),
      this.incrementKey(this.getAccountKey(email)),
    ]);
  }

  async clear(email: string, ip: string): Promise<void> {
    await Promise.all([
      this.store.del(this.getPairKey(email, ip)),
      this.store.del(this.getAccountKey(email)),
    ]);
  }
}
