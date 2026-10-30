import {
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AccountAuthorityClient,
  assertOwner,
  type AccountSnapshot,
  type AuthenticatedUser,
} from '@loccoc/common';
import { SocialRepository } from '../social/social.repository.js';
import { UsersRepository } from './users.repository.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { User } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    @Optional() private readonly authority?: AccountAuthorityClient,
    @Optional() private readonly social?: SocialRepository,
  ) {}

  async getMyProfile(userId: string, token?: string): Promise<User> {
    if (this.authority && this.social) {
      if (!token) throw new UnauthorizedException('Authentication required');
      const decision = await this.authority.access(token);
      if (decision.account.id !== userId)
        throw new UnauthorizedException('Invalid account');
      await this.social.project(decision.account);
    }
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async getUserById(
    targetId: string,
    requester: AuthenticatedUser,
  ): Promise<User> {
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

  async deleteMyAccount(userId: string, token?: string): Promise<void> {
    if (this.authority && this.social) {
      if (!token) throw new UnauthorizedException('Authentication required');
      const snapshot = await this.authority.call<AccountSnapshot>(
        `accounts/${userId}/delete`,
        token,
        'POST',
      );
      await this.social.project(snapshot);
      return;
    }
    const deleted = await this.usersRepository.softDelete(userId);
    if (!deleted) {
      throw new NotFoundException('User not found');
    }
  }

  async deleteUserById(
    targetId: string,
    _requester: AuthenticatedUser,
    token?: string,
  ): Promise<void> {
    if (this.authority && this.social) {
      if (!token) throw new UnauthorizedException('Authentication required');
      const snapshot = await this.authority.call<AccountSnapshot>(
        `accounts/${targetId}/delete`,
        token,
        'POST',
      );
      await this.social.project(snapshot);
      return;
    }
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
    const [data, total] = await this.usersRepository.findAll(
      page,
      limit,
      query.search,
    );
    return { data, total, page, limit };
  }
}
