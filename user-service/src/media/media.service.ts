import {
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { MediaRepository } from './media.repository.js';
import { UsersService } from '../users/users.service.js';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { REDIS_CLIENT } from '@loccoc/common';
import type { Redis } from 'ioredis';
import { MediaStorage } from './media.storage.js';
import {
  mediaKind,
  mediaLimit,
  processMedia,
  invalidMedia,
  type MediaKind,
} from './media.policy.js';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  private uploads = 0;
  constructor(
    private readonly storage: MediaStorage,
    private readonly repo: MediaRepository,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis | null,
    @Optional() private readonly users?: UsersService,
  ) {}

  async quota(id: string): Promise<void> {
    if (!this.redis)
      throw new ServiceUnavailableException('Upload limiter unavailable');
    let count: unknown;
    try {
      count = await this.redis.eval(
        `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],60000) end; return n`,
        1,
        `media:upload:${id}`,
      );
    } catch {
      throw new ServiceUnavailableException('Upload limiter unavailable');
    }
    if (Number(count) > 10)
      throw new HttpException(
        { code: 'MEDIA_RATE_LIMIT', message: 'Too many image uploads' },
        429,
      );
  }
  async upload(id: string, kindValue: string, request: Request) {
    if (this.uploads >= 4)
      throw new ServiceUnavailableException('Image processor is busy');
    this.uploads++;
    try {
      return await this.acceptUpload(id, kindValue, request);
    } finally {
      this.uploads--;
    }
  }
  private async acceptUpload(id: string, kindValue: string, request: Request) {
    const kind = mediaKind(kindValue);
    this.storage.assertConfigured();
    await this.quota(id);
    await this.users?.getMyProfile(id, request.headers.authorization);
    const mime = request.headers['content-type'] ?? '';
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(mime) ||
      request.headers['content-encoding']
    )
      throw invalidMedia();
    const limit = mediaLimit(kind);
    if (Number(request.headers['content-length']) > limit) {
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          request.off('end', finish);
          request.off('error', finish);
          resolve();
        };
        const timer = setTimeout(finish, 2000);
        request.once('end', finish);
        request.once('error', finish);
        request.resume();
      });
      throw new PayloadTooLargeException();
    }
    const chunks: Buffer[] = [];
    let length = 0;
    const timer = setTimeout(() => request.destroy(), 30000);
    try {
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += bytes.length;
        if (length > limit) {
          request.resume();
          throw new PayloadTooLargeException();
        }
        chunks.push(bytes);
      }
    } finally {
      clearTimeout(timer);
    }
    return this.replace(
      id,
      kind,
      await processMedia(Buffer.concat(chunks), kind, mime),
    );
  }
  async replace(id: string, kind: MediaKind, bytes: Buffer) {
    const key = `${id}/${kind}/${randomUUID()}.webp`;
    const url = this.storage.url(key);
    await this.repo.stage(id, kind, key, url);
    try {
      await this.storage.put(key, bytes);
    } catch {
      throw new ServiceUnavailableException({
        code: 'MEDIA_UNAVAILABLE',
        message: 'Image storage is unavailable',
      });
    }
    await this.repo.activate(id, kind, key, url);
    return this.repo.profile(id);
  }
  async clear(id: string, kindValue: string, token?: string) {
    const kind = mediaKind(kindValue);
    await this.users?.getMyProfile(id, token);
    await this.repo.clear(id, kind);
    return this.repo.profile(id);
  }
  onModuleInit(): void {
    if (!this.storage.enabled) return;
    this.timer = setInterval(() => {
      if (!this.pending)
        this.pending = this.cleanup()
          .catch(() => this.logger.warn('Media cleanup retry pending'))
          .finally(() => {
            this.pending = undefined;
          });
    }, 30000);
    this.timer.unref();
  }
  async cleanup(): Promise<void> {
    await this.repo.cleanup(
      (key) => this.storage.remove(key),
      () => this.logger.warn('Media cleanup retry pending'),
    );
  }
  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.pending;
  }
}
