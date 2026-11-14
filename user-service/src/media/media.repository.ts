import {
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity.js';
import { nextDisplayNameChangeAt } from '../users/display-name.policy.js';
import type { MediaKind } from './media.policy.js';

@Injectable()
export class MediaRepository {
  constructor(@Optional() private readonly db?: DataSource) {}
  async stage(
    id: string,
    kind: MediaKind,
    key: string,
    url: string,
  ): Promise<void> {
    await this.db!.query(
      'INSERT INTO profile_media_objects(object_key,user_id,kind,url) VALUES($1,$2,$3,$4)',
      [key, id, kind, url],
    );
  }
  async activate(
    id: string,
    kind: MediaKind,
    key: string,
    url: string,
  ): Promise<void> {
    await this.db!.transaction(async (manager) => {
      const user = await manager
        .getRepository(User)
        .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!user || user.accountStatus !== 'active')
        throw new NotFoundException();
      const rows = await manager.query(
        `UPDATE profile_media_objects SET state='active'
        WHERE object_key=$1 AND user_id=$2 AND kind=$3 AND state='staged' AND available_at>clock_timestamp() RETURNING object_key`,
        [key, id, kind],
      );
      if (!rows.length) throw new ServiceUnavailableException('Upload expired');
      await manager.query(
        `UPDATE users SET ${kind === 'avatar' ? 'avatar_url' : 'cover_url'}=$2,updated_at=clock_timestamp() WHERE id=$1`,
        [id, url],
      );
    });
  }
  async clear(id: string, kind: MediaKind): Promise<void> {
    await this.db!.transaction(async (manager) => {
      const user = await manager
        .getRepository(User)
        .findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!user || user.accountStatus !== 'active')
        throw new NotFoundException();
      await manager.query(
        `UPDATE users SET ${kind === 'avatar' ? 'avatar_url' : 'cover_url'}=NULL,updated_at=clock_timestamp() WHERE id=$1`,
        [id],
      );
    });
  }
  async profile(id: string) {
    const user = await this.db!.getRepository(User).findOneByOrFail({ id });
    return Object.assign(user, {
      nextDisplayNameChangeAt:
        nextDisplayNameChangeAt(user.lastDisplayNameChangedAt)?.toISOString() ??
        null,
    });
  }
  async cleanup(
    remove: (key: string) => Promise<void>,
    failed: () => void,
  ): Promise<void> {
    await this.db!.transaction(async (manager) => {
      const rows: { object_key: string }[] =
        await manager.query(`SELECT m.object_key FROM profile_media_objects m
        WHERE m.state<>'active' AND m.available_at<=clock_timestamp() AND NOT EXISTS(
          SELECT 1 FROM users u WHERE u.id=m.user_id AND u.deleted_at IS NULL AND u.account_status<>'deleted'
          AND (u.avatar_url=m.url OR u.cover_url=m.url))
        ORDER BY m.available_at LIMIT 10 FOR UPDATE SKIP LOCKED`);
      for (const row of rows) {
        try {
          await remove(row.object_key);
        } catch {
          await manager.query(
            `UPDATE profile_media_objects SET available_at=clock_timestamp()+interval '1 minute' WHERE object_key=$1`,
            [row.object_key],
          );
          failed();
          continue;
        }
        await manager.query(
          'DELETE FROM profile_media_objects WHERE object_key=$1',
          [row.object_key],
        );
      }
    });
  }
}
