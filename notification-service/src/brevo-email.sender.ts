import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailOtpPayload } from '@loccoc/common';

export class EmailDeliveryError extends Error {
  constructor(readonly retryable: boolean, readonly retryAfterSeconds = 5) {
    super('Email delivery unavailable');
  }
}
@Injectable()
export class BrevoEmailSender {
  private sender?: { email: string; name: string };
  constructor(private readonly config: ConfigService) {}
  private async request(path: string, body?: unknown): Promise<Response> {
    const key = this.config.get<string>('BREVO_MAIL_API_KEY');
    if (!key) throw new EmailDeliveryError(true, 30);
    try {
      const response = await fetch(`https://api.brevo.com/v3/${path}`, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { 'api-key': key, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        // Provider bodies can contain secrets/recipient data. Never log them.
        const retryAfter = Number(response.headers.get('retry-after'));
        await response.body?.cancel();
        throw new EmailDeliveryError(response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403,
          Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(300, retryAfter) : 5);
      }
      return response;
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error;
      throw new EmailDeliveryError(true);
    }
  }
  private async resolveSender(): Promise<{ email: string; name: string }> {
    if (this.sender) return this.sender;
    const email = this.config.get<string>('BREVO_SENDER_EMAIL');
    if (email) {
      this.sender = { email, name: this.config.get('BREVO_SENDER_NAME', 'LocCoc') };
    } else {
      // Existing installations may only have an API key. A single active sender is unambiguous.
      const response = await this.request('senders');
      const data = await response.json() as { senders?: { email: string; active: boolean }[] };
      const active = data.senders?.filter(s => s.active && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) ?? [];
      if (active.length !== 1) throw new EmailDeliveryError(true, 30);
      this.sender = { email: active[0]!.email, name: this.config.get('BREVO_SENDER_NAME', 'LocCoc') };
    }
    return this.sender;
  }
  async send(payload: EmailOtpPayload, eventId: string): Promise<void> {
    if (Date.parse(payload.expiresAt) <= Date.now()) return;
    const sender = await this.resolveSender();
    if (Date.parse(payload.expiresAt) <= Date.now()) return;
    const response = await this.request('smtp/email', {
      sender, to: [{ email: payload.email }], subject: 'Mã xác thực đăng ký LocCoc',
      textContent: `Mã OTP đăng ký LocCoc của bạn: ${payload.code}\n\nMã yêu cầu: ${payload.registrationId.slice(0, 8)}\nMã hết hạn sau tối đa 5 phút. Chỉ dùng mã cho yêu cầu đăng ký do bạn thực hiện. Không chia sẻ mã này với bất kỳ ai.\n\nNếu bạn không đăng ký LocCoc, hãy bỏ qua email này.`,
      headers: { idempotencyKey: eventId }, tags: ['loccoc-registration-otp'],
    });
    await response.body?.cancel();
  }
}
