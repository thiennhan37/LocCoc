# ADR-005: Provider-verified mobile social login

Status: Accepted

## Context

Mobile needs Google and Sign in with Apple authentication without trusting client-supplied identity fields. Auth-service owns external identities in its accounts PostgreSQL database; user-service remains the owner of profiles.

## Decision

- Verify provider ID tokens with `jose`, fixed HTTPS JWKS endpoints, RS256, provider issuer, configured client-ID allowlists, required `sub`, `iat`, `exp`, and optional nonce matching. Never use token-supplied URLs or keys.
- Use `(provider, provider_user_id)` as the immutable identity key. Auto-link an active local account only with a signed, verified provider email. Pending, deleted and suspended local accounts require additional verification/recovery; social login cannot activate them or retain an attacker's pre-registered password.
- Social-only accounts have a null password hash. Never invent a usable password. Identity creation and the normal session/refresh-token issuance occur in one transaction. Database uniqueness resolves concurrent first sign-ins with a bounded retry.
- Apple relay email is a legitimate email, not an alias to reverse-resolve. Store an optional first-login name on the identity as untrusted display metadata; Apple does not sign the name. Do not overwrite it on subsequent sign-ins.
- If either the token or request has a nonce, require both and compare exactly. The mobile client sends the exact nonce value passed to the provider (including any SDK-required SHA-256 encoding). This endpoint alone does not create a server-bound authentication challenge. Consume each verified ID token once using an atomic Redis marker until its expiry to prevent replay across server replicas; fail closed if Redis is unavailable.
- Android interactive login uses a fresh Android platform adapter and a secure random 32-byte nonce per attempt. The high-level Google singleton accepts its nonce only at initialization; using a separate platform adapter avoids reinitializing that singleton and prevents cached, previously consumed tokens from breaking login after rebuilds or repeated sign-in. No provider token or email is recorded in replay diagnostics.
- Expose public, tightly throttled POST `/auth/social/google` and `/auth/social/apple` under the existing gateway `/auth/*` proxy. An unconfigured provider returns 503.
- Local Android debug builds use loopback plus ADB reverse forwarding on port
  8080 for physical devices and emulators. Keep local cleartext HTTP permission
  in the debug manifest and require an explicit HTTPS API URL for deployment.
  Limit backend login requests to 15 seconds and return a retryable connection
  error without automatically replaying the provider ID token.

## Consequences

Clients must obtain a fresh provider ID token after an unsuccessful/ambiguous sign-in; reuse returns 401. Email-free or unverified first sign-ins return `SOCIAL_VERIFICATION_REQUIRED` (403) without linking or issuing tokens. Existing linked identities can sign in without an email claim. No account-link confirmation endpoint, profile synchronization, Apple authorization-code exchange, or mobile UI is introduced here.

## References

- https://developers.google.com/identity/sign-in/web/backend-auth
- https://accounts.google.com/.well-known/openid-configuration
- https://appleid.apple.com/.well-known/openid-configuration
- https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple
- https://github.com/panva/jose
