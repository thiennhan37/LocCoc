import { Injectable, NotFoundException } from '@nestjs/common';
import { assertOwner, type AuthenticatedUser } from '@loccoc/common';
import { UsersRepository } from './users.repository.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { User } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async getMyProfile(userId: string): Promise<User> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async getUserById(targetId: string, requester: AuthenticatedUser): Promise<User> {
    assertOwner(targetId, requester, ['admin', 'moderator']);
    const user = await this.usersRepository.findById(targetId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateMyProfile(userId: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.usersRepository.updateProfile(userId, dto);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateUserById(
    targetId: string,
    dto: UpdateUserDto,
    _requester: AuthenticatedUser,
  ): Promise<User> {
    const user = await this.usersRepository.updateProfile(targetId, dto);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async deleteMyAccount(userId: string): Promise<void> {
    const deleted = await this.usersRepository.softDelete(userId);
    if (!deleted) {
      throw new NotFoundException('User not found');
    }
  }

  async deleteUserById(targetId: string, _requester: AuthenticatedUser): Promise<void> {
    const deleted = await this.usersRepository.softDelete(targetId);
    if (!deleted) {
      throw new NotFoundException('User not found');
    }
  }

  async listUsers(
    query: ListUsersQueryDto,
    _requester: AuthenticatedUser,
  ): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await this.usersRepository.findAll(page, limit, query.search);
    return { data, total, page, limit };
  }
}
