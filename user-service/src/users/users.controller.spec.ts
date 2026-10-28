import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@loccoc/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';

describe('UsersController', () => {
  let controller: UsersController;
  let service: Partial<Record<keyof UsersService, ReturnType<typeof vi.fn>>>;

  const mockUser: AuthenticatedUser = {
    userId: '11111111-1111-1111-1111-111111111111',
    role: 'user',
    roles: ['user'],
    scopes: [],
    sessionId: 'sess-1',
    issuer: 'test',
    audience: 'test',
  };

  const sampleUser: User = {
    id: mockUser.userId,
    email: 'user@example.com',
    fullName: 'Test User',
    avatarUrl: null,
    phone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(() => {
    service = {
      listUsers: vi.fn(),
      getMyProfile: vi.fn(),
      getUserById: vi.fn(),
      updateMyProfile: vi.fn(),
      updateUserById: vi.fn(),
      deleteMyAccount: vi.fn(),
      deleteUserById: vi.fn(),
    };
    controller = new UsersController(service as unknown as UsersService);
  });

  it('GET /users calls service.listUsers', async () => {
    service.listUsers?.mockResolvedValue({ data: [sampleUser], total: 1, page: 1, limit: 20 });
    const result = await controller.listUsers({ page: 1, limit: 20 }, mockUser);
    expect(result.data).toHaveLength(1);
    expect(service.listUsers).toHaveBeenCalledWith({ page: 1, limit: 20 }, mockUser);
  });

  it('GET /users/me calls service.getMyProfile with token userId', async () => {
    service.getMyProfile?.mockResolvedValue(sampleUser);
    const result = await controller.getMyProfile(mockUser);
    expect(result).toEqual(sampleUser);
    expect(service.getMyProfile).toHaveBeenCalledWith(mockUser.userId);
  });

  it('GET /users/:id calls service.getUserById', async () => {
    service.getUserById?.mockResolvedValue(sampleUser);
    const result = await controller.getUserById('some-id', mockUser);
    expect(result).toEqual(sampleUser);
    expect(service.getUserById).toHaveBeenCalledWith('some-id', mockUser);
  });

  it('PATCH /users/me calls service.updateMyProfile with token userId and dto', async () => {
    service.updateMyProfile?.mockResolvedValue(Object.assign(new User(), sampleUser, { fullName: 'Updated' }));
    const result = await controller.updateMyProfile(mockUser, { fullName: 'Updated' });
    expect(result.fullName).toBe('Updated');
    expect(service.updateMyProfile).toHaveBeenCalledWith(mockUser.userId, { fullName: 'Updated' });
  });

  it('PATCH /users/:id calls service.updateUserById', async () => {
    service.updateUserById?.mockResolvedValue(Object.assign(new User(), sampleUser, { fullName: 'Admin' }));
    const result = await controller.updateUserById('target-id', { fullName: 'Admin' }, mockUser);
    expect(result.fullName).toBe('Admin');
    expect(service.updateUserById).toHaveBeenCalledWith('target-id', { fullName: 'Admin' }, mockUser);
  });

  it('DELETE /users/me calls service.deleteMyAccount with token userId', async () => {
    service.deleteMyAccount?.mockResolvedValue(undefined);
    await controller.deleteMyAccount(mockUser);
    expect(service.deleteMyAccount).toHaveBeenCalledWith(mockUser.userId);
  });

  it('DELETE /users/:id calls service.deleteUserById', async () => {
    service.deleteUserById?.mockResolvedValue(undefined);
    await controller.deleteUserById('target-id', mockUser);
    expect(service.deleteUserById).toHaveBeenCalledWith('target-id', mockUser);
  });
});
