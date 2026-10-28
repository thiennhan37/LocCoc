import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync } from 'node:crypto';
import { createRemoteJWKSet, customFetch, SignJWT, type JWTPayload } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialProvider } from '../entities/identity.entity.js';
import { createSocialJwks, SocialTokenVerifier, type SocialJwks } from './social-token-verifier.service.js';

const keys = {
  google: generateKeyPairSync('rsa', { modulusLength: 2048 }),
  apple: generateKeyPairSync('rsa', { modulusLength: 2048 }),
};
const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });
const settings: Record<string, string> = { GOOGLE_CLIENT_IDS: 'google-mobile,google-ios', APPLE_CLIENT_IDS: 'vn.loccoc.app' };
const issuer = { google: 'https://accounts.google.com', apple: 'https://appleid.apple.com' };
const audience = { google: 'google-mobile', apple: 'vn.loccoc.app' };

async function token(provider: SocialProvider, changes: JWTPayload = {}, wrongSignature = false): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: issuer[provider], aud: audience[provider], sub: `${provider}-subject`,
    iat: now, exp: now + 600, email: 'Person@Example.com', email_verified: true,
    ...changes,
  }).setProtectedHeader({ alg: 'RS256', kid: `${provider}-key` })
    .sign(wrongSignature ? attacker.privateKey : keys[provider].privateKey);
}

function harness() {
  const fetches = vi.fn(async (url: string) => {
    const provider = url.includes('appleid.apple.com') ? 'apple' : 'google';
    return new Response(JSON.stringify({ keys: [{
      ...keys[provider].publicKey.export({ format: 'jwk' }), kid: `${provider}-key`, alg: 'RS256', use: 'sig',
    }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const resolvers: SocialJwks = {
    google: createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { [customFetch]: fetches }),
    apple: createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'), { [customFetch]: fetches }),
  };
  const config = { get: (key: string, fallback?: string) => settings[key] ?? fallback } as ConfigService;
  return { verifier: new SocialTokenVerifier(config, resolvers), fetches };
}

describe.each<SocialProvider>(['google', 'apple'])('%s ID token JWKS verification', (provider) => {
  let verifier: SocialTokenVerifier;
  beforeEach(() => { ({ verifier } = harness()); });

  it('verifies a genuinely signed mock token via provider JWKS and normalizes only signed email', async () => {
    await expect(verifier.verify(provider, await token(provider))).resolves.toMatchObject({
      provider, providerUserId: `${provider}-subject`, email: 'person@example.com', emailVerified: true,
    });
  });

  it('rejects a wrong audience', async () => {
    await expect(verifier.verify(provider, await token(provider, { aud: 'attacker-app' }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(verifier.verify(provider, await token(provider, { iat: now - 600, exp: now - 1 }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a wrong signature even with a valid provider kid', async () => {
    await expect(verifier.verify(provider, await token(provider, {}, true))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects the other provider issuer', async () => {
    await expect(verifier.verify(provider, await token(provider, { iss: 'https://attacker.example' }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects missing required expiry, subject or issuance', async () => {
    for (const claim of ['exp', 'sub', 'iat']) {
      await expect(verifier.verify(provider, await token(provider, { [claim]: undefined }))).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('rejects future issuance and conflicting authorized party', async () => {
    await expect(verifier.verify(provider, await token(provider, { iat: Math.floor(Date.now() / 1000) + 60 }))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(verifier.verify(provider, await token(provider, { azp: 'other-client' }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('compares nonce and rejects omission on either side', async () => {
    const signed = await token(provider, { nonce: 'mobile-outstanding-nonce' });
    await expect(verifier.verify(provider, signed, 'mobile-outstanding-nonce')).resolves.toHaveProperty('provider', provider);
    await expect(verifier.verify(provider, signed, 'wrong-nonce')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(verifier.verify(provider, signed)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(verifier.verify(provider, await token(provider), 'unexpected-nonce')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not interpret truthy strings as verified email', async () => {
    for (const flag of ['false', '1', 1, false]) {
      await expect(verifier.verify(provider, await token(provider, { email_verified: flag }))).resolves.toHaveProperty('emailVerified', false);
    }
  });

  it('rejects HS256 and none instead of treating provider keys as symmetric secrets', async () => {
    const signed = await token(provider);
    const [, payload, signature] = signed.split('.');
    for (const alg of ['HS256', 'none']) {
      const header = Buffer.from(JSON.stringify({ alg, kid: `${provider}-key` })).toString('base64url');
      await expect(verifier.verify(provider, `${header}.${payload}.${signature}`)).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('uses the cache for repeated verification and ignores attacker jku', async () => {
    const { verifier: cachedVerifier, fetches } = harness();
    const now = Math.floor(Date.now() / 1000);
    const signed = await new SignJWT({ iss: issuer[provider], aud: audience[provider], sub: 's', iat: now, exp: now + 600 })
      .setProtectedHeader({ alg: 'RS256', kid: `${provider}-key`, jku: 'https://attacker.example/keys' }).sign(keys[provider].privateKey);
    await cachedVerifier.verify(provider, signed);
    await cachedVerifier.verify(provider, signed);
    expect(fetches).toHaveBeenCalledTimes(1);
    expect(fetches.mock.calls[0][0]).toBe(provider === 'google' ? 'https://www.googleapis.com/oauth2/v3/certs' : 'https://appleid.apple.com/auth/keys');
  });
});

describe('provider configuration and Apple claims', () => {
  it('refreshes cached JWKS when a provider rotates to a new signing kid', async () => {
    let rotated = false;
    const fetches = vi.fn(async () => new Response(JSON.stringify({ keys: [{
      ...(rotated ? attacker.publicKey : keys.google.publicKey).export({ format: 'jwk' }),
      kid: rotated ? 'rotated-google-key' : 'google-key', alg: 'RS256', use: 'sig',
    }] }), { status: 200 }));
    const resolver = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { [customFetch]: fetches, cooldownDuration: 0 });
    const verifier = new SocialTokenVerifier({ get: () => 'google-mobile' } as unknown as ConfigService, { google: resolver, apple: resolver });
    await verifier.verify('google', await token('google'));
    rotated = true;
    const now = Math.floor(Date.now() / 1000);
    const signed = await new SignJWT({ iss: issuer.google, aud: audience.google, sub: 'rotated-sub', iat: now, exp: now + 600 })
      .setProtectedHeader({ alg: 'RS256', kid: 'rotated-google-key' }).sign(attacker.privateKey);
    await expect(verifier.verify('google', signed)).resolves.toHaveProperty('providerUserId', 'rotated-sub');
    expect(fetches).toHaveBeenCalledTimes(2);
  });

  it('accepts Apple string booleans and the private relay email without attempting to uncover a real address', async () => {
    const { verifier } = harness();
    await expect(verifier.verify('apple', await token('apple', {
      email: 'Relay123@privaterelay.appleid.com', email_verified: 'true', is_private_email: 'true', name: 'Unsigned name claim',
    }))).resolves.toMatchObject({ email: 'relay123@privaterelay.appleid.com', emailVerified: true, isPrivateEmail: true, name: null });
  });

  it('supports Google legacy issuer and a second configured mobile audience', async () => {
    const { verifier } = harness();
    await expect(verifier.verify('google', await token('google', { iss: 'accounts.google.com', aud: 'google-ios' }))).resolves.toHaveProperty('provider', 'google');
  });

  it('fails closed when the provider is unconfigured', async () => {
    const verifier = new SocialTokenVerifier({ get: () => '' } as unknown as ConfigService, createSocialJwks());
    await expect(verifier.verify('google', await token('google'))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails closed on a JWKS outage without exposing provider details', async () => {
    const unavailable = async () => { throw new TypeError('internal network details'); };
    const verifier = new SocialTokenVerifier({ get: () => 'google-mobile' } as unknown as ConfigService, { google: unavailable, apple: unavailable });
    await expect(verifier.verify('google', await token('google'))).rejects.toThrow('Social verification is temporarily unavailable');
  });
});
