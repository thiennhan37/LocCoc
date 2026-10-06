import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthController } from '../src/auth/auth.controller.js';
import { AuthService } from '../src/auth/auth.service.js';
import { RegisterDto } from '../src/auth/dto/register.dto.js';
import { User, UserRole, UserStatus } from '../src/auth/entities/user.entity.js';
import {
  InMemoryOtpStore,
  OTP_SENDER,
  OTP_STORE,
  OtpSender,
  OtpService,
} from '../src/auth/services/otp.service.js';
import { PasswordService } from '../src/auth/services/password.service.js';

type TestRepository = {
  findOne: (options: { where: Partial<User> }) => Promise<User | null>;
  create: (data: Partial<User>) => User;
  save: (user: User) => Promise<User>;
};

describe('Auth HTTP API (e2e)', () => {
  let app: INestApplication;
  let users: User[];
  let sent: Array<{ destination: string; code: string; channel: 'email' | 'phone' }>;
  let repository: TestRepository;

  beforeEach(async () => {
    users = [];
    sent = [];
    repository = {
      findOne: async ({ where }) => users.find((candidate) =>
        Object.entries(where).every(([key, value]) => (candidate as any)[key] === value),
      ) ?? null,
      create: (data) => ({
        id: randomUUID(),
        email: data.email!,
        phone: data.phone ?? null,
        passwordHash: data.passwordHash!,
        role: data.role ?? UserRole.USER,
        status: data.status ?? UserStatus.PENDING_VERIFICATION,
        emailVerifiedAt: data.emailVerifiedAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
      save: async (user) => {
        const existing = users.findIndex((candidate) => candidate.id === user.id);
        if (existing < 0) users.push(user);
        else users[existing] = user;
        return user;
      },
    };
    const sender: OtpSender = {
      send: async (destination, code, channel) => {
        sent.push({ destination, code, channel });
      },
    };
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        PasswordService,
        OtpService,
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: OTP_STORE, useValue: new InMemoryOtpStore() },
        { provide: OTP_SENDER, useValue: sender },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  async function register(email = 'person@example.com', password = 'correct horse battery staple 2026') {
    return request(app.getHttpServer()).post('/auth/register').send({ email, password });
  }

  it('registers a user and sends an email OTP', async () => {
    const response = await register(' Person@Example.COM ');

    expect(response.status).toBe(201);
    expect(response.body.message).toMatch(/verify the otp/i);
    expect(response.body.userId).toBeTypeOf('string');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ destination: 'person@example.com', channel: 'email' });
    expect(sent[0].code).toMatch(/^\d{6}$/);
    expect(users[0].status).toBe(UserStatus.PENDING_VERIFICATION);

    const verified = await request(app.getHttpServer()).post('/auth/verify-otp').send({
      email: 'person@example.com', otp: sent[0].code,
    });
    expect(verified.status).toBe(200);
    expect(verified.body.verified).toBe(true);
    expect(users[0].status).toBe(UserStatus.ACTIVE);
  });

  it('rejects passwords that do not satisfy the policy', async () => {
    const response = await register('weak@example.com', 'weak@example.com');
    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/password does not meet policy/i);
    expect(users).toHaveLength(0);
  });

  it('uses the same accepted response for an existing email', async () => {
    const first = await register('duplicate@example.com');
    const second = await register('DUPLICATE@example.com');
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual({ message: expect.stringMatching(/registration accepted/i) });
  });

  it('invalidates an OTP after more than five incorrect submissions', async () => {
    await register();
    const wrongCode = sent[0].code === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app.getHttpServer()).post('/auth/verify-otp').send({
        email: 'person@example.com', otp: wrongCode,
      });
      expect(response.status).toBe(200);
      expect(response.body.verified).toBe(false);
    }
    const final = await request(app.getHttpServer()).post('/auth/verify-otp').send({
      email: 'person@example.com', otp: sent[0].code,
    });
    expect(final.body.verified).toBe(false);
    expect(final.body.message).toMatch(/invalid or expired/i);
  });

  it('rejects an expired OTP', async () => {
    await register('expired@example.com');
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 5 * 60 * 1000 + 1);
    const response = await request(app.getHttpServer()).post('/auth/verify-otp').send({
      email: 'expired@example.com', otp: sent[0].code,
    });
    expect(response.body.verified).toBe(false);
    expect(response.body.message).toMatch(/invalid or expired/i);
  });

  it('blocks resend spam without sending another OTP', async () => {
    await register('spam@example.com');
    const before = sent.length;
    const response = await request(app.getHttpServer()).post('/auth/resend-otp').send({ email: 'spam@example.com' });
    expect(response.status).toBe(429);
    expect(sent).toHaveLength(before);
  });

  it('returns the same generic login error for wrong and unknown accounts', async () => {
    await register('active@example.com');
    await request(app.getHttpServer()).post('/auth/verify-otp').send({
      email: 'active@example.com', otp: sent[0].code,
    });
    const wrong = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'active@example.com', password: 'wrong-password-123',
    });
    const unknown = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'missing@example.com', password: 'wrong-password-123',
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });
});


