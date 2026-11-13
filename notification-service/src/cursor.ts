import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
@Injectable()
export class CursorCodec {
  constructor(private readonly config: ConfigService) {}
  sign(
    user: string,
    purpose: 'seen' | 'page',
    value: Record<string, string>,
  ): string {
    const data = Buffer.from(
      JSON.stringify({ user, purpose, value, exp: Date.now() + 86400000 }),
    ).toString('base64url');
    return data + '.' + this.mac(data);
  }
  private mac(data: string) {
    return createHmac(
      'sha256',
      this.config.getOrThrow<string>('NOTIFICATION_CURSOR_SECRET'),
    )
      .update(data)
      .digest('base64url');
  }
  decode(
    user: string,
    purpose: 'seen' | 'page',
    token: string,
  ): Record<string, string> {
    try {
      if (token.length > 2048) throw Error();
      const [data, mac, ...rest] = token.split('.');
      const expected = this.mac(data);
      if (
        rest.length ||
        !mac ||
        mac.length !== expected.length ||
        !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
      )
        throw Error();
      const parsed = JSON.parse(Buffer.from(data, 'base64url').toString());
      if (
        parsed.user !== user ||
        parsed.purpose !== purpose ||
        !Number.isSafeInteger(parsed.exp) ||
        parsed.exp < Date.now() ||
        !parsed.value
      )
        throw Error();
      return parsed.value;
    } catch {
      throw new BadRequestException('Invalid or expired cursor');
    }
  }
}
