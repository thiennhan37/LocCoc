import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  async findAll(page = 1, limit = 20, search?: string): Promise<[User[], number]> {
    const qb = this.repo.createQueryBuilder('user');
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      qb.where('(user.fullName ILIKE :term OR user.email ILIKE :term)', { term });
    }
    qb.skip((page - 1) * limit)
      .take(limit)
      .orderBy('user.createdAt', 'DESC');
    return qb.getManyAndCount();
  }

  async updateProfile(
    id: string,
    data: Partial<Pick<User, 'fullName' | 'avatarUrl' | 'phone'>>,
  ): Promise<User | null> {
    const user = await this.findById(id);
    if (!user) {
      return null;
    }
    if (data.fullName !== undefined) {
      user.fullName = data.fullName;
    }
    if (data.avatarUrl !== undefined) {
      user.avatarUrl = data.avatarUrl;
    }
    if (data.phone !== undefined) {
      user.phone = data.phone;
    }
    return this.repo.save(user);
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.repo.softDelete(id);
    return (result.affected ?? 0) > 0;
  }
}
