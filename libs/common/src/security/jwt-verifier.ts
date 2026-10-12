import { createVerify } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { JwtPayload } from '../interfaces/authenticated-user.js';

type JwtHeader = { alg?: string; kid?: string; typ?: string };

function decodePart(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4), 'base64');
}

@Injectable()
export class JwtVerifier {
  verify(token: string, options: { publicKey: string; issuer: string; audience: string; kid?: string; algorithm?: 'RS256' }): JwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Invalid access token');
    let header: JwtHeader;
    let payload: JwtPayload;
    try {
      header = JSON.parse(decodePart(parts[0]).toString('utf8')) as JwtHeader;
      payload = JSON.parse(decodePart(parts[1]).toString('utf8')) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
    const algorithm = options.algorithm ?? 'RS256';
    if (header.alg !== algorithm || header.typ !== 'JWT' || !header.kid || (options.kid && header.kid !== options.kid)) throw new UnauthorizedException('Invalid access token');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    let valid = false;
    try { valid = verifier.verify(options.publicKey, decodePart(parts[2])); } catch { valid = false; }
    if (!valid) throw new UnauthorizedException('Invalid access token');
    const now = Math.floor(Date.now() / 1000);
    const audienceMatches = Array.isArray(payload.aud) ? payload.aud.includes(options.audience) : payload.aud === options.audience;
    if (!payload.sub || !payload.role || !payload.sid || payload.iss !== options.issuer || !audienceMatches ||
        !Number.isFinite(payload.exp) || payload.exp <= now || !Number.isFinite(payload.iat) || payload.iat > now + 60) {
      throw new UnauthorizedException('Invalid access token');
    }
    return payload;
  }
}