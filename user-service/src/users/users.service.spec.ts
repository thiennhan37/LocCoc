import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@loccoc/common';
import { UsersService } from './users.service.js';
import { UsersRepository } from './users.repository.js';
import { User } from './entities/user.entity.js';

describe('UsersService', () => {
  let service: UsersService;
  let repo: Partial<Record<keyof UsersRepository, ReturnType<typeof vi.fn>>>;

  const regularUser: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    role: 'user',
    roles: ['user'],
    scopes: [],
    sessionId: 'sess-1',
    issuer: 'test',
    audience: 'test',
  };

  const moderatorUser: AuthenticatedUser = {
    userId: '22222222-2222-2222-2222-222222222222',
    role: 'moderator',
    roles: ['moderator'],
    scopes: [],
    sessionId: 'sess-2',
    issuer: 'test',
    audience: 'test',
  };

  const adminUser: AuthenticatedUser = {
    userId: '33333333-3333-3333-3333-333333333333',
    role: 'admin',
    roles: ['admin'],
    scopes: [],
    sessionId: 'sess-3',
    issuer: 'test',
    audience: 'test',
  };

  const sampleUser: User = {
    id: regularUser.userId,
    email: 'user@example.com',
    fullName: 'Test User',
    avatarUrl: null,
    phone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(() => {
    repo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findAll: vi.fn(),
      updateProfile: vi.fn(),
      softDelete: vi.fn(),
    };
    service = new UsersService(repo as unknown as UsersRepository);
  });

  describe('getMyProfile', () => {
    it('returns user when found', async () => {
      repo.findById?.mockResolvedValue(sampleUser);
      const result = await service.getMyProfile(regularUser.userId);
      expect(result).toEqual(sampleUser);
      expect(repo.findById).toHaveBeenCalledWith(regularUser.userId);
    });

    it('throws 404 NotFoundException when not found', async () => {
      repo.findById?.mockResolvedValue(null);
      await expect(service.getMyProfile(regularUser.userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserById (anti-IDOR)', () => {
    it('allows owner to access their own profile', async () => {
      repo.findById?.mockResolvedValue(sampleUser);
      const result = await service.getUserById(regularUser.userId, regularUser);
      expect(result).toEqual(sampleUser);
    });

    it('throws 404 NotFoundException when regular user accesses another user profile', async () => {
      const otherUserId = '44444444-4444-4444-4444-444444444444';
      await expect(service.getUserById(otherUserId, regularUser)).rejects.toThrow(NotFoundException);
      expect(repo.findById).not.toHaveBeenCalled();
    });

    it('allows moderator to view any user profile', async () => {
      repo.findById?.mockResolvedValue(sampleUser);
      const result = await service.getUserById(sampleUser.id, moderatorUser);
      expect(result).toEqual(sampleUser);
      expect(repo.findById).toHaveBeenCalledWith(sampleUser.id);
    });

    it('allows admin to view any user profile', async () => {
      repo.findById?.mockResolvedValue(sampleUser);
      const result = await service.getUserById(sampleUser.id, adminUser);
      expect(result).toEqual(sampleUser);
      expect(repo.findById).toHaveBeenCalledWith(sampleUser.id);
    });

    it('throws 404 if user not found in database for admin', async () => {
      repo.findById?.mockResolvedValue(null);
      await expect(service.getUserById('non-existent', adminUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMyProfile', () => {
    it('updates own profile and returns updated user', async () => {
      const updated = Object.assign(new User(), sampleUser, { fullName: 'New Name' });
      repo.updateProfile?.mockResolvedValue(updated);

      const result = await service.updateMyProfile(regularUser.userId, { fullName: 'New Name' });
      expect(result.fullName).toBe('New Name');
      expect(repo.updateProfile).toHaveBeenCalledWith(regularUser.userId, { fullName: 'New Name' });
    });

    it('throws 404 when user not found', async () => {
      repo.updateProfile?.mockResolvedValue(null);
      await expect(
        service.updateMyProfile(regularUser.userId, { fullName: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUserById', () => {
    it('updates user by ID and returns user', async () => {
      const updated = Object.assign(new User(), sampleUser, { fullName: 'Admin Updated' });
      repo.updateProfile?.mockResolvedValue(updated);

      const result = await service.updateUserById(sampleUser.id, { fullName: 'Admin Updated' }, adminUser);
      expect(result.fullName).toBe('Admin Updated');
      expect(repo.updateProfile).toHaveBeenCalledWith(sampleUser.id, { fullName: 'Admin Updated' });
    });

    it('throws 404 if user does not exist', async () => {
      repo.updateProfile?.mockResolvedValue(null);
      await expect(
        service.updateUserById('non-existent', { fullName: 'Admin Updated' }, adminUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteMyAccount', () => {
    it('soft deletes own account successfully', async () => {
      repo.softDelete?.mockResolvedValue(true);
      await expect(service.deleteMyAccount(regularUser.userId)).resolves.toBeUndefined();
      expect(repo.softDelete).toHaveBeenCalledWith(regularUser.userId);
    });

    it('throws 404 if account not found', async () => {
      repo.softDelete?.mockResolvedValue(false);
      await expect(service.deleteMyAccount(regularUser.userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteUserById', () => {
    it('soft deletes account by id successfully', async () => {
      repo.softDelete?.mockResolvedValue(true);
      await expect(service.deleteUserById(sampleUser.id, adminUser)).resolves.toBeUndefined();
      expect(repo.softDelete).toHaveBeenCalledWith(sampleUser.id);
    });

    it('throws 404 if account not found', async () => {
      repo.softDelete?.mockResolvedValue(false);
      await expect(service.deleteUserById('non-existent', adminUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('listUsers', () => {
    it('returns paginated list of users', async () => {
      repo.findAll?.mockResolvedValue([[sampleUser], 1]);

      const result = await service.listUsers({ page: 1, limit: 10, search: 'test' }, moderatorUser);
      expect(result).toEqual({
        data: [sampleUser],
        total: 1,
        page: 1,
        limit: 10,
      });
      expect(repo.findAll).toHaveBeenCalledWith(1, 10, 'test');
    });

    it('uses default page and limit when not specified', async () => {
      repo.findAll?.mockResolvedValue([[sampleUser], 1]);

      const result = await service.listUsers({}, adminUser);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(repo.findAll).toHaveBeenCalledWith(1, 20, undefined);
    });
  });
});
