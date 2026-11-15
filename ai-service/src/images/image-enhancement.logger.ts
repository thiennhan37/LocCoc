import { Injectable, Logger } from '@nestjs/common';

export interface EnhancementLogEvent {
  requestId: string;
  filterId: string | undefined;
  mimeType: string | undefined;
  byteCount: number | undefined;
  durationMs: number;
  outcome: 'SUCCESS' | 'VALIDATION_REJECTED' | 'TIMEOUT' | 'PROVIDER_REJECTED' | 'INVALID_OUTPUT' | 'CANCELLED';
  status: number;
}

@Injectable()
export class ImageEnhancementLogger {
  private readonly logger = new Logger(ImageEnhancementLogger.name);

  record(event: EnhancementLogEvent): void {
    const safePayload = {
      requestId: event.requestId,
      filterId: event.filterId,
      mimeType: event.mimeType,
      byteCount: event.byteCount,
      durationMs: event.durationMs,
      outcome: event.outcome,
      status: event.status,
    };
    
    this.logger.log(`Enhancement [${event.requestId}] ${event.outcome} (${event.durationMs}ms)`, safePayload);
  }
}
