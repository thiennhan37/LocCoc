import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { OTP_POLICY } from './config/otp-policy.js';
import { InjectRepository } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { REDIS_CLIENT } from '../database/redis.tokens.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResendOtpDto, VerifyOtpDto } from './dto/otp.dto.js';
import { Account, AccountRole, AccountStatus } from './entities/account.entity.js';
import { Session } from './entities/session.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { LoginLockoutService } from './services/login-lockout.service.js';
import { OtpService } from './services/otp.service.js';
import { PasswordService } from './services/password.service.js';
import { TokenPair, TokenService } from './services/token.service.js';

export interface AuthRequestContext {
  ip?: string;
  userAgent?: string;
  platform?: string;
}

export interface AuthenticatedContext {
  userId: string;
  sessionId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @Optional() @InjectRepository(Session) private readonly sessions: Repository<Session> | undefined,
    @Optional() @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken> | undefined,
    private readonly passwords: PasswordService,
    private readonly otps: OtpService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    @Optional() private readonly tokens?: TokenService,
    @Optional() private readonly dataSource?: DataSource,
    @Optional() private readonly lockout?: LoginLockoutService,
  ) {}

  normalizeEmail(email: string): string { return email.trim().toLowerCase(); }

  normalizePhone(phone?: string): string | null {
    if (!phone) return null;
    const normalized = phone.trim().replace(/[\s().-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      throw new BadRequestException({
        code: 'INVALID_PHONE_NUMBER',
        message: 'Phone must use international format, e.g. +84375456123',
      });
    }
    return normalized;
  }

  async register(dto: RegisterDto, context: AuthRequestContext = {}): Promise<{ message: string; registrationId: string; expiresIn: number; retryAfter: number }> {
    const email = this.normalizeEmail(dto.email);
    const policyErrors = this.passwords.validatePolicy(dto.password, email);
    if (policyErrors.length) {
      await this.passwords.hash(dto.password);
      throw new ConflictException({ message: 'Password does not meet policy', errors: policyErrors });
    }
    const phone = this.normalizePhone(dto.phone);
    const registrationId = randomUUID();
    const accepted = { message: 'Registration accepted. Verify the OTP sent to your email.', registrationId,
      expiresIn: OTP_POLICY.ttlSeconds, retryAfter: OTP_POLICY.resendIntervalSeconds };
    // Hash even for existing accounts; never expose existence or overwrite active credentials.
    const passwordHash = await this.passwords.hash(dto.password);
    const existing = await this.accounts.findOne({ where: { email }, withDeleted: true });
    const existingPhone = phone ? await this.accounts.findOne({ where: { phone } }) : null;
    if ((existing && (existing.deletedAt || existing.status !== AccountStatus.PENDING_VERIFICATION)) ||
        (existingPhone && existingPhone.id !== existing?.id)) {
      return accepted;
    }
    const user = this.accounts.create({
      email, phone, passwordHash: null,
      role: AccountRole.USER, status: AccountStatus.PENDING_VERIFICATION, emailVerifiedAt: null,
    });
    let saved: Account;
    try {
      saved = existing ?? await this.accounts.save(user);
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
        // A concurrent registration won the unique constraint. The caller can safely start again.
        return accepted;
      }
      throw error;
    }
    await this.otps.createRegistration(registrationId, { email, accountId: saved.id, passwordHash }, context.ip ?? 'unknown');
    return accepted;
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{ verified: boolean; message: string }> {
    const destination = dto.email ? this.normalizeEmail(dto.email) : this.normalizePhone(dto.phone ?? undefined);
    if (!destination) return { verified: false, message: 'Invalid verification request' };
    const invalid = { verified: false, message: 'Invalid or expired OTP' };
    if (dto.email) {
      if (!dto.registrationId) return invalid;
      const challenge = await this.otps.verifyRegistration(destination, dto.registrationId, dto.otp);
      if (!challenge) return invalid;
      const activate = async (accounts: Repository<Account>, locked: boolean) => {
        const account = await accounts.findOne({ where: { id: challenge.accountId, email: destination },
          ...(locked ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
        if (!account || account.status !== AccountStatus.PENDING_VERIFICATION || account.deletedAt) return false;
        account.status = AccountStatus.ACTIVE;
        account.emailVerifiedAt = new Date();
        account.passwordHash = challenge.passwordHash;
        await accounts.save(account);
        return true;
      };
      const activated = this.dataSource
        ? await this.dataSource.transaction(manager => activate(manager.getRepository(Account), true))
        : await activate(this.accounts, false);
      return activated ? { verified: true, message: 'OTP verified' } : invalid;
    }
    return await this.otps.verify(destination, dto.otp) ? { verified: true, message: 'OTP verified' } : invalid;
  }

  async resendOtp(dto: ResendOtpDto, context: AuthRequestContext = {}): Promise<{ message: string; expiresIn: number; retryAfter: number }> {
    const accepted = { message: 'If the registration is pending, an OTP will be sent.',
      expiresIn: OTP_POLICY.ttlSeconds, retryAfter: OTP_POLICY.resendIntervalSeconds };
    const destination = dto.email ? this.normalizeEmail(dto.email) : this.normalizePhone(dto.phone ?? undefined);
    if (!destination || !dto.email || !dto.registrationId || (dto.channel && dto.channel !== 'email')) return accepted;
    const user = dto.email ? await this.accounts.findOne({ where: { email: this.normalizeEmail(dto.email) } }) : undefined;
    if (user?.status === AccountStatus.PENDING_VERIFICATION) {
      await this.otps.resendRegistration(destination, dto.registrationId, context.ip ?? 'unknown');
    }
    return accepted;
  }

  async login(dto: LoginDto, context: AuthRequestContext = {}): Promise<Record<string, unknown>> {
    const email = this.normalizeEmail(dto.email);
    const ip = context.ip ?? 'unknown';
    if (this.lockout && (await this.lockout.isLocked(email, ip))) {
      throw new HttpException('Too many failed login attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const user = await this.accounts.findOne({ where: { email } });
    const validPassword = await this.passwords.verify(user?.passwordHash, dto.password);
    if (!user || !validPassword || user.status !== AccountStatus.ACTIVE) {
      if (this.lockout) await this.lockout.recordFailure(email, ip);
      throw new UnauthorizedException('Invalid credentials');
    }
    if (this.lockout) await this.lockout.clear(email, ip);
    const issued = await this.issueSession(user, context);
    return { authenticated: true, user: this.publicAccount(user), ...(issued ?? {}) };
  }

  async refresh(dto: RefreshDto, context: AuthRequestContext = {}): Promise<TokenPair> {
    this.requireTokenInfrastructure();
    const hash = this.tokens!.hashRefreshToken(dto.refreshToken);
    const pair = await this.dataSource!.transaction(async (manager): Promise<TokenPair | null> => {
      const refreshTokens = manager.getRepository(RefreshToken);
      const sessions = manager.getRepository(Session);
      const reference = await refreshTokens.findOne({ where: { tokenHash: hash } });
      if (!reference) throw new UnauthorizedException('Invalid refresh token');
      const session = await sessions.findOne({
        where: { id: reference.sessionId, userId: reference.userId },
        lock: { mode: 'pessimistic_write' },
      });
      const tokenRecord = await refreshTokens.findOne({
        where: { tokenHash: hash }, lock: { mode: 'pessimistic_write' },
      });
      const now = new Date();
      if (!session || !tokenRecord ||
          session.revokedAt || session.expiresAt <= now || tokenRecord.expiresAt <= now) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      if (tokenRecord.usedAt) {
        tokenRecord.reuseDetectedAt = now;
        await refreshTokens.save(tokenRecord);
        await this.revokeSession(manager, tokenRecord.sessionId, now);
        return null;
      }
      if (tokenRecord.revokedAt || session.refreshTokenHash !== hash) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      const account = await manager.getRepository(Account).findOne({ where: { id: tokenRecord.userId } });
      if (!account || account.status !== AccountStatus.ACTIVE) throw new UnauthorizedException('Invalid refresh token');
      const nextRefreshToken = this.tokens!.createRefreshToken();
      const nextHash = this.tokens!.hashRefreshToken(nextRefreshToken);
      tokenRecord.usedAt = now;
      await refreshTokens.save(tokenRecord);
      await refreshTokens.save(refreshTokens.create(this.refreshTokenRecord(session, account, nextRefreshToken)));
      session.refreshTokenHash = nextHash;
      session.lastUsedAt = now;
      if (context.userAgent || context.platform) {
        session.deviceInfo = {
          userAgent: context.userAgent ?? session.deviceInfo?.userAgent,
          platform: context.platform ?? session.deviceInfo?.platform,
        };
      }
      session.ip = context.ip ?? session.ip;
      await sessions.save(session);
      return this.tokens!.issuePair(account, session.id, nextRefreshToken);
    });
    if (!pair) throw new UnauthorizedException('Invalid refresh token');
    return pair;
  }

  async logout(current: AuthenticatedContext): Promise<{ revoked: boolean }> {
    this.requireTokenInfrastructure();
    return this.dataSource!.transaction(async (manager) => {
      const sessions = manager.getRepository(Session);
      const now = new Date();
      const result = await sessions.update(
        { id: current.sessionId, userId: current.userId, revokedAt: IsNull() }, { revokedAt: now },
      );
      if (result.affected === 0) return { revoked: false };
      await manager.getRepository(RefreshToken).update(
        { sessionId: current.sessionId, userId: current.userId, revokedAt: IsNull() }, { revokedAt: now },
      );
      await this.publishSessionRevocation(current.sessionId);
      return { revoked: result.affected === 1 };
    });
  }

  async logoutAll(userId: string): Promise<{ revokedSessions: number }> {
    this.requireTokenInfrastructure();
    return this.dataSource!.transaction(async (manager) => {
      const sessionsRepo = manager.getRepository(Session);
      const now = new Date();
      // Fetch active session IDs before revoking, so we can publish each to Redis
      const activeSessions = await sessionsRepo.find({
        where: { userId, revokedAt: IsNull() },
        select: ['id'],
      });
      const result = await sessionsRepo.update({ userId, revokedAt: IsNull() }, { revokedAt: now });
      await manager.getRepository(RefreshToken).update({ userId, revokedAt: IsNull() }, { revokedAt: now });
      await Promise.all(activeSessions.map((s) => this.publishSessionRevocation(s.id)));
      return { revokedSessions: result.affected ?? 0 };
    });
  }

  async changePassword(dto: ChangePasswordDto, current: AuthenticatedContext, context: AuthRequestContext = {}): Promise<Record<string, unknown>> {
    this.requireTokenInfrastructure();
    return this.dataSource!.transaction(async (manager) => {
      const accountsRepo = manager.getRepository(Account);
      const sessionsRepo = manager.getRepository(Session);
      const refreshTokensRepo = manager.getRepository(RefreshToken);
      const account = await accountsRepo.findOne({ where: { id: current.userId }, lock: { mode: 'pessimistic_write' } });
      if (!account || !(await this.passwords.verify(account.passwordHash, dto.currentPassword))) {
        throw new UnauthorizedException('Invalid current password');
      }
      const newErrors = this.passwords.validatePolicy(dto.newPassword, account.email);
      if (newErrors.length) throw new ConflictException({ message: 'Password does not meet policy', errors: newErrors });
      const newHash = await this.passwords.hash(dto.newPassword);
      account.passwordHash = newHash;
      await accountsRepo.save(account);
      const now = new Date();
      // Fetch active session IDs before revoking for Redis publication
      const activeSessions = await sessionsRepo.find({
        where: { userId: current.userId, revokedAt: IsNull() },
        select: ['id'],
      });
      await sessionsRepo.update({ userId: current.userId, revokedAt: IsNull() }, { revokedAt: now });
      await refreshTokensRepo.update({ userId: current.userId, revokedAt: IsNull() }, { revokedAt: now });
      await Promise.all(activeSessions.map((s) => this.publishSessionRevocation(s.id)));
      const issued = await this.createSession(manager, account, context);
      return { message: 'Password changed', ...issued };
    });
  }

  /** Internal entry point after provider verification and transactional account
   * resolution. Reuses the exact password-login session/token implementation. */
  async createSocialSession(manager: EntityManager, account: Account, context: AuthRequestContext): Promise<Record<string, unknown>> {
    this.requireTokenInfrastructure();
    const pair = await this.createSession(manager, account, context);
    return { authenticated: true, user: this.publicAccount(account), ...pair };
  }

  private async issueSession(account: Account, context: AuthRequestContext): Promise<TokenPair | undefined> {
    if (!this.tokens || !this.sessions || !this.refreshTokens || !this.dataSource) return undefined;
    return this.dataSource.transaction((manager) => this.createSession(manager, account, context));
  }

  private async createSession(manager: EntityManager, account: Account, context: AuthRequestContext): Promise<TokenPair> {
    const refreshToken = this.tokens!.createRefreshToken();
    const session = manager.getRepository(Session).create({
      id: this.tokens!.createSessionId(),
      userId: account.id,
      refreshTokenHash: this.tokens!.hashRefreshToken(refreshToken),
      deviceInfo: { userAgent: context.userAgent, platform: context.platform },
      ip: context.ip ?? null,
      expiresAt: new Date(Date.now() + this.tokens!.getRefreshTtl() * 1000),
      revokedAt: null,
    });
    await manager.getRepository(Session).save(session);
    await manager.getRepository(RefreshToken).save(this.refreshTokenRecord(session, account, refreshToken));
    return this.tokens!.issuePair(account, session.id, refreshToken);
  }

  private refreshTokenRecord(session: Session, account: Account, refreshToken: string): RefreshToken {
    return {
      sessionId: session.id,
      userId: account.id,
      tokenHash: this.tokens!.hashRefreshToken(refreshToken),
      expiresAt: session.expiresAt,
      usedAt: null,
      revokedAt: null,
      reuseDetectedAt: null,
    } as RefreshToken;
  }

  private async revokeSession(manager: EntityManager, sessionId: string, now: Date): Promise<void> {
    await manager.getRepository(Session).update({ id: sessionId, revokedAt: IsNull() }, { revokedAt: now });
    await manager.getRepository(RefreshToken).update({ sessionId, revokedAt: IsNull() }, { revokedAt: now });
    await this.publishSessionRevocation(sessionId);
  }

  private requireTokenInfrastructure(): void {
    if (!this.tokens || !this.dataSource || !this.refreshTokens) throw new Error('Token infrastructure is not configured');
  }

  private publicAccount(user: Account): Record<string, unknown> {
    return { id: user.id, email: user.email, phone: user.phone, role: user.role, status: user.status, emailVerifiedAt: user.emailVerifiedAt };
  }

  /**
   * Publish a session revocation to Redis so downstream services (user-service, etc.)
   * can reject tokens from revoked sessions without inter-service calls.
   *
   * Key:   auth:revoked:sid:<sessionId>
   * Value: "1"
   * TTL:   JWT_ACCESS_TTL_SECONDS (default 900s = 15min)
   *
   * After the access token expires naturally, the key is no longer needed because
   * the token itself will fail expiry validation in JwtVerifier.
   */
  private async publishSessionRevocation(sessionId: string): Promise<void> {
    try {
      const ttl = this.config.get<number>('JWT_ACCESS_TTL_SECONDS', 900);
      await this.redis.set(`auth:revoked:sid:${sessionId}`, '1', 'EX', ttl);
    } catch (error) {
      // Log but don't fail the logout flow — eventual consistency is acceptable.
      // The token will expire naturally within JWT_ACCESS_TTL_SECONDS anyway.
      this.logger.warn(`Failed to publish session revocation for ${sessionId}: ${error}`);
    }
  }
}
