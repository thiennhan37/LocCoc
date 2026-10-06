import { randomUUID } from 'node:crypto';
import { User } from './entities/user.entity.js';

/** Development/test repository. Production can replace the getRepositoryToken
 * provider with TypeORM's Repository<User> without changing AuthService. */
export class InMemoryUserRepository {
  private readonly records: User[] = [];

  async findOne(options: { where?: Partial<User> | { email?: string; phone?: string } }): Promise<User | null> {
    const where = options.where ?? {};
    return this.records.find((candidate) => Object.entries(where).every(([key, value]) => (candidate as any)[key] === value)) ?? null;
  }

  create(data: Partial<User>): User {
    return {
      id: randomUUID(), email: '', phone: null, passwordHash: '', role: undefined as never,
      status: undefined as never, emailVerifiedAt: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
      ...data,
    } as User;
  }

  async save(user: User): Promise<User> {
    const index = this.records.findIndex((candidate) => candidate.id === user.id);
    user.updatedAt = new Date();
    if (index === -1) this.records.push(user); else this.records[index] = user;
    return user;
  }
}

