import { randomUUID } from 'node:crypto';
import { Account } from './entities/account.entity.js';

/** Development/test repository. Production can replace the getRepositoryToken
 * provider with TypeORM's Repository<Account> without changing AuthService. */
export class InMemoryAccountRepository {
  private readonly records: Account[] = [];

  async findOne(options: { where?: Partial<Account> | { email?: string; phone?: string } }): Promise<Account | null> {
    const where = options.where ?? {};
    return this.records.find((candidate) => Object.entries(where).every(([key, value]) => (candidate as any)[key] === value)) ?? null;
  }

  create(data: Partial<Account>): Account {
    return {
      id: randomUUID(), email: '', phone: null, passwordHash: '', role: undefined as never,
      status: undefined as never, emailVerifiedAt: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
      ...data,
    } as Account;
  }

  async save(user: Account): Promise<Account> {
    const index = this.records.findIndex((candidate) => candidate.id === user.id);
    user.updatedAt = new Date();
    if (index === -1) this.records.push(user); else this.records[index] = user;
    return user;
  }
}

