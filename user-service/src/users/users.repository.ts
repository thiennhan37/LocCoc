import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';
import { writeDisplayName, type ProfileActor } from './display-name.writer.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { isMediaStorageOrigin } from '../media/media.policy.js';

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

  async findAll(
    page = 1,
    limit = 20,
    search?: string,
  ): Promise<[User[], number]> {
    const qb = this.repo.createQueryBuilder('user');
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      qb.where('(user.displayName ILIKE :term OR user.email ILIKE :term)', {
        term,
      });
    }
    qb.skip((page - 1) * limit)
      .take(limit)
      .orderBy('user.createdAt', 'DESC');
    return qb.getManyAndCount();
  }

  async updateProfile(
    id: string,
    data: UpdateUserDto,
    actor: ProfileActor = { id, type: 'USER' },
  ): Promise<User | null> {
    return this.repo.manager.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const user = await users.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) return null;
      if (data.displayName !== undefined) {
        await writeDisplayName(manager, id, data.displayName, actor);
      }
      // Reload after the shared writer to avoid saving stale name/cooldown fields.
      const updated = (await users.findOneBy({ id }))!;
      for (const field of ['avatarUrl', 'coverUrl'] as const) {
        const value = data[field];
        if (value === undefined) continue;
        if (value && value !== updated[field]) {
          const owned: { url: string }[] = await manager.query(
            'SELECT url FROM profile_media_objects WHERE url=$1',
            [value],
          );
          if (
            owned.length ||
            isMediaStorageOrigin(value, process.env.MEDIA_PUBLIC_BASE_URL ?? '')
          )
            throw new BadRequestException({
              code: 'INVALID_MEDIA',
              message: 'Use the upload endpoint for managed media',
            });
        }
        updated[field] = value || null;
      }
      if (data.phone !== undefined) updated.phone = data.phone;
      return users.save(updated);
    });
  }

  async displayNameHistory(id: string, page: number, limit: number) {
    return this.repo.manager.transaction('REPEATABLE READ', async (manager) => {
      const data: {
        id: string;
        actorId: string;
        actorType: string;
        oldName: string | null;
        newName: string;
        changedAt: Date;
      }[] = await manager.query(
        `SELECT id,actor_id AS "actorId",actor_type AS "actorType",old_name AS "oldName",
         new_name AS "newName",changed_at AS "changedAt" FROM display_name_changes
         WHERE user_id=$1 ORDER BY changed_at DESC,id DESC LIMIT $2 OFFSET $3`,
        [id, limit, (page - 1) * limit],
      );
      const [{ total }]: { total: string }[] = await manager.query(
        'SELECT count(*) AS total FROM display_name_changes WHERE user_id=$1',
        [id],
      );
      return { data, total: Number(total), page, limit };
    });
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.repo.softDelete(id);
    return (result.affected ?? 0) > 0;
  }
}
