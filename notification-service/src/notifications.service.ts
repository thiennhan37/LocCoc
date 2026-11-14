import { Injectable } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository.js';
import type { ListDto } from './notifications.dto.js';
@Injectable()
export class NotificationsService {
  constructor(private readonly repo: NotificationsRepository) {}
  list(user: string, q: ListDto) {
    return this.repo.list(user, q.limit, q.cursor);
  }
  counts(user: string) {
    return this.repo.counts(user);
  }
  seen(user: string, cursor: string) {
    return this.repo.seen(user, cursor);
  }
  read(user: string, id: string) {
    return this.repo.read(user, id);
  }
  register(
    user: string,
    session: string,
    id: string,
    token: string,
    platform: string,
  ) {
    return this.repo.register(user, session, id, token, platform);
  }
  unregister(user: string, session: string, id: string) {
    return this.repo.unregister(user, session, id);
  }
}
