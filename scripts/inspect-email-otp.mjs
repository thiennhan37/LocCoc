import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Read-only diagnostics. Never print passwords, OTP values, keys or encrypted payloads.
const require = createRequire(import.meta.url);
const { Client } = require(require.resolve('pg', { paths: [resolve('auth-service')] }));
const read = path => parseEnv(readFileSync(path, 'utf8'));
const root = read('.env');
const mask = email => typeof email === 'string' ? email.replace(/^(.{1,2}).*(@.*)$/, '$1***$2') : null;
for (const [service, prefix, table] of [
  ['auth-service', 'AUTH', 'auth_email_outbox'],
  ['notification-service', 'NOTIFICATION', 'email_otp_jobs'],
]) {
  const env = { ...root, ...read(`${service}/.env`) };
  const db = new Client({ host: env.DB_HOST, port: Number(env.DB_PORT || 5433),
    user: env[`${prefix}_DB_USER`], password: env[`${prefix}_DB_PASSWORD`], database: env[`${prefix}_DB_NAME`],
    connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  try {
    await db.connect();
    const exists = (await db.query('SELECT to_regclass($1) AS name', [table])).rows[0].name;
    const summary = { service, otpTableExists: !!exists,
      emailEnabled: env.EMAIL_OTP_ENABLED ?? 'auto', brevoKeyPresent: !!env.BREVO_MAIL_API_KEY,
      nodeEnvironment: env.NODE_ENV, migrationsEnabled: env.TYPEORM_MIGRATIONS_RUN };
    if (exists) summary.queue = (await db.query(service === 'auth-service'
      ? 'SELECT id,registration_id,created_at,expires_at,published_at FROM auth_email_outbox ORDER BY created_at DESC LIMIT 10'
      : 'SELECT event_id,created_at,expires_at,attempts,next_attempt_at,finished_at,result FROM email_otp_jobs ORDER BY created_at DESC LIMIT 10')).rows;
    if (service === 'auth-service') summary.recentAccounts = (await db.query(
      'SELECT email,status,email_verified_at,created_at FROM accounts ORDER BY created_at DESC LIMIT 8')).rows.map(({ email, ...row }) => ({ email: mask(email), ...row }));
    if (service === 'notification-service') summary.recentQuarantine = (await db.query(
      "SELECT topic,partition,offset_id,reason,created_at FROM notification_quarantine WHERE topic LIKE '%otp%' ORDER BY created_at DESC LIMIT 5")).rows;
    console.log(JSON.stringify(summary));
  } catch (error) { console.log(JSON.stringify({ service, errorCode: error.code ?? error.name })); }
  finally { await db.end().catch(() => {}); }
}
const key = { ...root, ...read('notification-service/.env') }.BREVO_MAIL_API_KEY;
if (key) {
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/statistics/events?limit=30&sort=desc', {
      headers: { 'api-key': key, accept: 'application/json' }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) console.log(JSON.stringify({ brevoEventsHttpStatus: response.status }));
    else {
      const data = await response.json();
      console.log(JSON.stringify({ brevoEvents: (data.events ?? []).filter(row => row.subject === 'Mã xác thực đăng ký LocCoc').map(({ email, event, date, subject, messageId, reason }) => ({
        email: mask(email), event, date, subject, messageId,
        ...(reason ? { reason: String(reason).replace(/\b\d{6}\b/g, '[redacted-code]') } : {}),
      })) }));
    }
  } catch (error) { console.log(JSON.stringify({ brevoEventsUnavailable: true, errorCode: error.cause?.code ?? error.name })); }
}
