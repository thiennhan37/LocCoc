import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity.js';
import { Session } from '../entities/session.entity.js';

@Injectable()
export class SessionCleanupService {
  constructor(
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    private readonly db: DataSource,
  ) {}

  // Run every hour at the start of the hour (minute 0).
  @Cron('0 * * * *')
  async removeExpiredSessions(): Promise<void> {
    const now = new Date();
    // Keep unexpired used tokens so a replay can still be detected. They are
    // removed after their natural expiry, together with expired sessions.
    await this.refreshTokens.delete({ expiresAt: LessThanOrEqual(now) });
    await this.sessions.delete({ expiresAt: LessThanOrEqual(now) });
    await this.db
      .query(`DELETE FROM login_history WHERE created_at<=now()-interval '90 days'
      AND (revoked_at IS NOT NULL OR expires_at<=now())`);
  }
}
