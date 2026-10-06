import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

type Argon2Api = {
  argon2id: number;
  hash(password: string, options: { type: number; memoryCost: number; timeCost: number; parallelism: number }): Promise<string>;
  verify(hash: string, password: string, options: { type: number }): Promise<boolean>;
};

// Loading through createRequire keeps the service buildable in minimal test
// environments; production installs argon2 from package.json.
const argon2 = createRequire(import.meta.url)('argon2') as Argon2Api;

/** Password policy and Argon2id operations live in one service so that callers
 * cannot accidentally use a weaker hash algorithm. */
@Injectable()
export class PasswordService {
  private readonly memoryCost: number;
  private readonly timeCost: number;
  private readonly parallelism: number;
  private readonly commonPasswords: Set<string>;
  private readonly commonPrefixes: string[];

  constructor(@Optional() private readonly config?: ConfigService) {
    this.memoryCost = this.numberConfig('AUTH_ARGON2_MEMORY_COST', 19_456);
    this.timeCost = this.numberConfig('AUTH_ARGON2_TIME_COST', 2);
    this.parallelism = this.numberConfig('AUTH_ARGON2_PARALLELISM', 1);
    const configured = this.config?.get<string>('COMMON_PASSWORDS', '') ?? '';
    const configuredPath = this.config?.get<string>('COMMON_PASSWORDS_PATH', '') ?? '';
    let filePasswords = '';
    if (configuredPath) {
      try { filePasswords = readFileSync(configuredPath, 'utf8'); } catch { /* fail closed with the built-in list */ }
    }
    this.commonPasswords = new Set([
      'password', 'password1', 'qwerty',
      'qwerty123', '111111', 'letmein', 'welcome', 'iloveyou',
      ...configured.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
      ...filePasswords.split(/\r?\n/).map((value) => value.trim().toLowerCase()).filter(Boolean),
    ]);
    // The deployment can mount a 10k–100k breached-password list through
    // COMMON_PASSWORDS_PATH. These prefixes also catch the common variants
    // (for example Password123!) without requiring the raw list in source.
    this.commonPrefixes = ['password', 'qwerty', 'letmein', 'welcome', 'monkey', 'dragon', 'football'];
  }

  private numberConfig(name: string, fallback: number): number {
    const value = this.config?.get<number | string>(name);
    const parsed = Number(value ?? fallback);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.memoryCost,
      timeCost: this.timeCost,
      parallelism: this.parallelism,
    });
  }

  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    // Hash a supplied password even for an unknown account. This makes the
    // account-present and account-absent paths have comparable cost.
    if (!hash) {
      await this.hash(password);
      return false;
    }
    try {
      return await argon2.verify(hash, password, { type: argon2.argon2id });
    } catch {
      return false;
    }
  }

  validatePolicy(password: string, email?: string): string[] {
    const errors: string[] = [];
    if (password.length < 6) errors.push('password must be at least 6 characters');
    if (password.length > 128) errors.push('password must be at most 128 characters');
    const normalized = password.trim().toLowerCase();
    if (this.commonPasswords.has(normalized) || this.commonPrefixes.some((prefix) => normalized.startsWith(prefix) && normalized.length <= prefix.length + 8)) {
      errors.push('password is too common');
    }
    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      const localPart = normalizedEmail.split('@')[0];
      if (normalized === normalizedEmail || (localPart.length >= 3 && normalized === localPart)) {
        errors.push('password must not match email');
      }
    }
    return errors;
  }

  assertPolicy(password: string, email?: string): void {
    const errors = this.validatePolicy(password, email);
    if (errors.length) throw new Error(errors.join('; '));
  }
}
