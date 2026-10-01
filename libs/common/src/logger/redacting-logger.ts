import type { LoggerService } from '@nestjs/common';

const sensitive = /^(password|token|accesstoken|refreshtoken|otp|authorization)$/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitive.test(key) ? '[REDACTED]' : redact(item)]));
  }
  return value;
}

export class RedactingLogger implements LoggerService {
  log(message: unknown, context?: string): void { this.write('info', message, context); }
  error(message: unknown, trace?: string, context?: string): void { this.write('error', message, context); }
  warn(message: unknown, context?: string): void { this.write('warn', message, context); }
  debug(message: unknown, context?: string): void { this.write('debug', message, context); }
  verbose(message: unknown, context?: string): void { this.write('trace', message, context); }

  private write(level: string, message: unknown, context?: string): void {
    const entry = JSON.stringify({ level, time: new Date().toISOString(), context, message: redact(message) });
    if (level === 'error') process.stderr.write(`${entry}\n`);
    else process.stdout.write(`${entry}\n`);
  }
}
