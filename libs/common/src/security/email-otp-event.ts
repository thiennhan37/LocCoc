import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from 'node:crypto';

export const EMAIL_OTP_TOPIC = 'auth.email-otp.v1';
export interface EmailOtpPayload {
  email: string;
  code: string;
  registrationId: string;
  expiresAt: string;
}
export interface EmailOtpEvent {
  eventId: string;
  eventType: 'EMAIL_OTP_REQUESTED';
  aggregateId: string;
  timestamp: string;
  version: 1;
  expiresAt: string;
  data: { iv: string; ciphertext: string; tag: string };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function otpSecret(config: { get<T>(key: string): T | undefined }): string {
  const secret = config.get<string>('OTP_EVENT_SECRET') || config.get<string>('INTERNAL_SERVICE_TOKEN');
  if (!secret || secret.length < 32) throw new Error('OTP_EVENT_SECRET or INTERNAL_SERVICE_TOKEN must contain at least 32 characters');
  return secret;
}
export function deriveOtpKey(secret: string, purpose: 'event' | 'hash'): Buffer {
  if (secret.length < 32) throw new Error('Invalid OTP secret');
  return Buffer.from(hkdfSync('sha256', secret, 'loccoc-email-otp-v1', purpose, 32));
}
function aad(e: Omit<EmailOtpEvent, 'data'>): Buffer {
  return Buffer.from(JSON.stringify([e.eventId, e.eventType, e.aggregateId, e.timestamp, e.version, e.expiresAt]));
}
export function encryptEmailOtp(payload: EmailOtpPayload, secret: string): EmailOtpEvent {
  const envelope: Omit<EmailOtpEvent, 'data'> = {
    eventId: randomUUID(), eventType: 'EMAIL_OTP_REQUESTED', aggregateId: payload.registrationId,
    timestamp: new Date().toISOString(), version: 1, expiresAt: payload.expiresAt,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveOtpKey(secret, 'event'), iv);
  cipher.setAAD(aad(envelope));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return { ...envelope, data: { iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') } };
}
export function parseEmailOtpEvent(raw: unknown): EmailOtpEvent {
  const e = raw as EmailOtpEvent | null;
  if (!e || !uuid.test(e.eventId) || !uuid.test(e.aggregateId) || e.version !== 1 || e.eventType !== 'EMAIL_OTP_REQUESTED' ||
      typeof e.timestamp !== 'string' || typeof e.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(e.timestamp)) || !Number.isFinite(Date.parse(e.expiresAt)) ||
      Date.parse(e.timestamp) > Date.now() + 60_000 || Date.parse(e.expiresAt) <= Date.parse(e.timestamp) ||
      Date.parse(e.expiresAt) - Date.parse(e.timestamp) > 301_000 ||
      !e.data || typeof e.data.iv !== 'string' || typeof e.data.tag !== 'string' || typeof e.data.ciphertext !== 'string' ||
      !/^[A-Za-z0-9+/=]+$/.test(e.data.ciphertext) || e.data.ciphertext.length > 4096 ||
      Buffer.from(e.data.iv, 'base64').length !== 12 || Buffer.from(e.data.tag, 'base64').length !== 16) {
    throw new Error('Invalid email OTP event');
  }
  return { eventId: e.eventId, eventType: e.eventType, aggregateId: e.aggregateId, timestamp: e.timestamp,
    version: 1, expiresAt: e.expiresAt, data: { iv: e.data.iv, tag: e.data.tag, ciphertext: e.data.ciphertext } };
}
export function decryptEmailOtp(event: EmailOtpEvent, secret: string): EmailOtpPayload {
  const e = parseEmailOtpEvent(event);
  const decipher = createDecipheriv('aes-256-gcm', deriveOtpKey(secret, 'event'), Buffer.from(e.data.iv, 'base64'));
  decipher.setAAD(aad(e));
  decipher.setAuthTag(Buffer.from(e.data.tag, 'base64'));
  const payload = JSON.parse(Buffer.concat([decipher.update(Buffer.from(e.data.ciphertext, 'base64')), decipher.final()]).toString('utf8')) as EmailOtpPayload;
  if (typeof payload.email !== 'string' || payload.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
      !/^\d{6}$/.test(payload.code) || payload.registrationId !== e.aggregateId || payload.expiresAt !== e.expiresAt) {
    throw new Error('Invalid email OTP payload');
  }
  return payload;
}
