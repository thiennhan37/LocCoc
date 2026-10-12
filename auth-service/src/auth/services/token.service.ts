import { createSign, randomBytes, randomUUID, createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import type { Account } from '../entities/account.entity.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

@Injectable()
export class TokenService {
  private readonly privateKey: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly kid: string;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;

  constructor(private readonly config: ConfigService) {
    this.privateKey = this.readPrivateKey();
    this.issuer = config.get<string>('JWT_ISSUER', 'loccoc-auth');
    this.audience = config.get<string>('JWT_AUDIENCE', 'loccoc-api');
    this.kid = config.get<string>('JWT_KID', 'loccoc-2026-01');
    this.accessTtl = config.get<number>('JWT_ACCESS_TTL_SECONDS', 900);
    this.refreshTtl = config.get<number>('JWT_REFRESH_TTL_SECONDS', 2_592_000);
  }

  createRefreshToken(): string { return randomBytes(32).toString('base64url'); }
  hashRefreshToken(token: string): string { return createHash('sha256').update(token, 'utf8').digest('hex'); }
  createSessionId(): string { return randomUUID(); }
  getRefreshTtl(): number { return this.refreshTtl; }

  issuePair(account: Pick<Account, 'id' | 'role'>, sessionId: string, refreshToken: string): TokenPair {
    const now = Math.floor(Date.now() / 1000);
    const header = encode({ alg: 'RS256', typ: 'JWT', kid: this.kid });
    const payload = encode({
      sub: account.id,
      role: account.role,
      sid: sessionId,
      iat: now,
      exp: now + this.accessTtl,
      iss: this.issuer,
      aud: this.audience,
    });
    const signingInput = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const accessToken = `${signingInput}.${signer.sign(this.privateKey).toString('base64url')}`;
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.accessTtl,
      refreshExpiresIn: this.refreshTtl,
    };
  }

  private readPrivateKey(): string {
    const inline = this.config.get<string>('JWT_PRIVATE_KEY', '').replace(/\\n/g, '\n');
    if (inline) return inline;
    const path = this.config.get<string>('JWT_PRIVATE_KEY_PATH', '');
    if (!path) throw new Error('JWT private key is not configured');
    return readFileSync(path, 'utf8');
  }
}