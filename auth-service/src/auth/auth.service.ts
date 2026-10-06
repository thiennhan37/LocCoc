import { ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResendOtpDto, VerifyOtpDto } from './dto/otp.dto.js';
import { User, UserRole, UserStatus } from './entities/user.entity.js';
import { OtpService } from './services/otp.service.js';
import { PasswordService } from './services/password.service.js';

export interface AuthRequestContext { ip?: string }

@Injectable()
export class AuthService {
  private readonly loginFailures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly passwords: PasswordService,
    private readonly otps: OtpService,
  ) {}

  normalizeEmail(email: string): string { return email.trim().toLowerCase(); }

  normalizePhone(phone?: string): string | null {
    if (!phone) return null;
    const normalized = phone.trim().replace(/[\s().-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new ConflictException('Invalid phone number');
    return normalized;
  }

  async register(dto: RegisterDto, context: AuthRequestContext = {}): Promise<{ message: string; userId?: string }> {
    const email = this.normalizeEmail(dto.email);
    const policyErrors = this.passwords.validatePolicy(dto.password, email);
    if (policyErrors.length) {
      // Spend the same password-hashing cost as the other registration paths
      // before returning a policy error, including for an existing address.
      await this.passwords.hash(dto.password);
      throw new ConflictException({ message: 'Password does not meet policy', errors: policyErrors });
    }
    const phone = this.normalizePhone(dto.phone);
    const existing = await this.users.findOne({ where: { email } });
    const existingPhone = phone ? await this.users.findOne({ where: { phone } }) : null;
    if (existing || existingPhone) {
      // Keep the cost close to the account-creation path to reduce enumeration.
      // The hash is deliberately repeated before returning the same accepted
      // response for either identifier.
      await this.passwords.hash(dto.password);
      return { message: 'Registration accepted. Verify the OTP sent to your email.' };
    }
    const user = this.users.create({
      email, phone, passwordHash: await this.passwords.hash(dto.password),
      role: UserRole.USER, status: UserStatus.PENDING_VERIFICATION, emailVerifiedAt: null,
    });
    let saved: User;
    try {
      saved = await this.users.save(user);
    } catch (error) {
      // A concurrent registration can win the unique constraint between the
      // lookup and insert. Preserve the same anti-enumeration response.
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
        return { message: 'Registration accepted. Verify the OTP sent to your email.' };
      }
      throw error;
    }
    try { await this.otps.issue(email, context.ip ?? 'unknown', 'email'); }
    catch (error) {
      // Rollback is left to the transaction boundary in a database-backed app;
      // registration still returns a generic response when delivery is throttled.
      if (error instanceof Error && /limit|frequent/i.test(error.message)) throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
      throw error;
    }
    return { message: 'Registration accepted. Verify the OTP sent to your email.', userId: saved.id };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<{ verified: boolean; message: string }> {
    const destination = dto.email ? this.normalizeEmail(dto.email) : this.normalizePhone(dto.phone ?? undefined);
    if (!destination) return { verified: false, message: 'Invalid verification request' };
    const verified = await this.otps.verify(destination, dto.otp);
    if (!verified) return { verified: false, message: 'Invalid or expired OTP' };
    if (dto.email) {
      const user = await this.users.findOne({ where: { email: this.normalizeEmail(dto.email) } });
      if (user && user.status === UserStatus.PENDING_VERIFICATION) {
        user.status = UserStatus.ACTIVE;
        user.emailVerifiedAt = new Date();
        await this.users.save(user);
      }
    }
    return { verified: true, message: 'OTP verified' };
  }

  async resendOtp(dto: ResendOtpDto, context: AuthRequestContext = {}): Promise<{ message: string }> {
    const destination = dto.email ? this.normalizeEmail(dto.email) : this.normalizePhone(dto.phone ?? undefined);
    if (!destination) return { message: 'If the account exists, an OTP will be sent.' };
    const user = dto.email ? await this.users.findOne({ where: { email: this.normalizeEmail(dto.email) } }) : undefined;
    if (user || dto.phone) {
      try { await this.otps.issue(destination, context.ip ?? 'unknown', dto.channel ?? (dto.phone ? 'phone' : 'email')); }
      catch (error) {
        if (error instanceof Error && /limit|frequent/i.test(error.message)) {
          throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
        }
        throw error;
      }
    }
    return { message: 'If the account exists, an OTP will be sent.' };
  }

  async login(dto: LoginDto, context: AuthRequestContext = {}): Promise<{ user: Record<string, unknown>; authenticated: true }> {
    const email = this.normalizeEmail(dto.email);
    const ip = context.ip ?? 'unknown';
    const key = `${email}|${ip}`;
    const lock = this.loginFailures.get(key);
    if (lock && lock.lockedUntil > Date.now()) throw new UnauthorizedException('Invalid credentials');
    const user = await this.users.findOne({ where: { email } });
    const validPassword = await this.passwords.verify(user?.passwordHash, dto.password);
    if (!user || !validPassword || user.status !== UserStatus.ACTIVE) {
      this.recordLoginFailure(key);
      throw new UnauthorizedException('Invalid credentials');
    }
    this.loginFailures.delete(key);
    return { authenticated: true, user: this.publicUser(user) };
  }

  private recordLoginFailure(key: string): void {
    const previous = this.loginFailures.get(key) ?? { count: 0, lockedUntil: 0 };
    const count = previous.count + 1;
    // Lock only after repeated failures, then exponentially back off up to 15m.
    const lockMs = count >= 5 ? Math.min(15 * 60_000, 1_000 * 2 ** Math.min(count - 5, 10)) : 0;
    this.loginFailures.set(key, { count, lockedUntil: lockMs ? Date.now() + lockMs : 0 });
  }

  private publicUser(user: User): Record<string, unknown> {
    return { id: user.id, email: user.email, phone: user.phone, role: user.role, status: user.status, emailVerifiedAt: user.emailVerifiedAt };
  }
}
