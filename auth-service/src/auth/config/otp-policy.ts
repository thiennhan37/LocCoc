/**
 * Versioned OTP security policy.
 *
 * Keep these values in source control so every build of a given version uses
 * the same OTP behaviour. Increase `version` when changing the policy and
 * document the change in the release notes.
 */
export const OTP_POLICY = Object.freeze({
  version: 1,
  ttlSeconds: 300,
  maxAttempts: 5,
  resendIntervalSeconds: 60,
  maxSendsPerHour: 5,
  ipMaxSendsPerHour: 20,
  windowSeconds: 60 * 60,
} as const);

export type OtpPolicy = typeof OTP_POLICY;

