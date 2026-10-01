import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(request: Record<string, any>): Promise<string> {
    return String(request.ip ?? 
      (request.socket as { remoteAddress?: string } | undefined)?.remoteAddress ?? 'unknown');
  }
}
