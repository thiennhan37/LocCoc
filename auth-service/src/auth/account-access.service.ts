import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  JwtVerifier,
  type AccessDecision,
  type AccountSnapshot,
} from '@loccoc/common';

@Injectable()
export class AccountAccessService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly verifier: JwtVerifier,
  ) {}

  async access(
    authorization: string,
    allowSuspended = false,
  ): Promise<AccessDecision> {
    if (!authorization.startsWith('Bearer '))
      throw new UnauthorizedException('Authentication required');
    const p = this.verifier.verify(authorization.slice(7).trim(), {
      publicKey: this.config.getOrThrow<string>('JWT_PUBLIC_KEY'),
      issuer: this.config.get<string>('JWT_ISSUER', 'loccoc-auth'),
      audience: this.config.get<string>('JWT_AUDIENCE', 'loccoc-api'),
      kid: this.config.get<string>('JWT_KID', 'loccoc-2026-01'),
      algorithm: 'RS256',
    });
    const rows: { snapshot: AccountSnapshot; role: string }[] =
      await this.db.query(
        `
      SELECT account_snapshot(a) AS snapshot, a.role FROM accounts a JOIN sessions s ON s.user_id=a.id
      WHERE a.id=$1 AND s.id=$2 AND s.revoked_at IS NULL AND s.expires_at>now() AND a.deleted_at IS NULL`,
        [p.sub, p.sid],
      );
    const row = rows[0];
    if (!row) throw new UnauthorizedException('Session is unavailable');
    if (!allowSuspended && row.snapshot.status !== 'active')
      throw new ForbiddenException({
        code: 'ACCOUNT_UNAVAILABLE',
        message: 'Account is unavailable',
      });
    return {
      account: row.snapshot,
      user: {
        userId: p.sub,
        sessionId: p.sid,
        role: row.role,
        roles: [row.role],
        scopes: [],
        issuer: p.iss,
        audience: p.aud,
      },
    };
  }

  async snapshot(id: string): Promise<AccountSnapshot> {
    const rows: { snapshot: AccountSnapshot }[] = await this.db.query(
      'SELECT account_snapshot(a) AS snapshot FROM accounts a WHERE id=$1',
      [id],
    );
    if (!rows[0]) throw new NotFoundException('User not found');
    return rows[0].snapshot;
  }

  async remove(id: string, authorization: string): Promise<AccountSnapshot> {
    const { user } = await this.access(authorization);
    if (id !== user.userId && user.role !== 'admin')
      throw new NotFoundException('User not found');
    const rows: { id: string }[] = await this.db.query(
      'WITH removed AS (UPDATE accounts SET deleted_at=now(), updated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id) SELECT * FROM removed',
      [id],
    );
    if (!rows[0]) throw new NotFoundException('User not found');
    return this.snapshot(id);
  }

  async setStatus(
    id: string,
    status: 'active' | 'suspended',
    authorization: string,
  ): Promise<AccountSnapshot> {
    const { user } = await this.access(authorization);
    if (user.role !== 'admin' || id === user.userId)
      throw new ForbiddenException('Not permitted');
    const rows: { id: string }[] = await this.db.query(
      `WITH changed AS (UPDATE accounts SET status=$2, updated_at=now()
      WHERE id=$1 AND deleted_at IS NULL AND status <> 'pending_verification' RETURNING id) SELECT * FROM changed`,
      [id, status],
    );
    if (!rows[0]) throw new NotFoundException('User not found');
    return this.snapshot(id);
  }
}
