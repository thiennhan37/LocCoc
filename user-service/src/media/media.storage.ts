import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class MediaStorage {
  private client?: S3Client;
  constructor(private readonly config: ConfigService) {}
  get enabled(): boolean {
    return this.config.get<string>('MEDIA_ENABLED', 'false') === 'true';
  }
  get publicBase(): string {
    return this.config
      .get<string>('MEDIA_PUBLIC_BASE_URL', '')
      .replace(/\/$/, '');
  }
  assertConfigured(): void {
    if (!this.enabled)
      throw new ServiceUnavailableException({
        code: 'MEDIA_UNAVAILABLE',
        message: 'Image uploads are unavailable',
      });
    try {
      const endpoint = new URL(
        this.config.getOrThrow<string>('MEDIA_S3_ENDPOINT'),
      );
      const publicUrl = new URL(this.publicBase);
      for (const url of [endpoint, publicUrl]) {
        if (
          !['https:', 'http:'].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          (this.config.get('NODE_ENV') === 'production' &&
            url.protocol !== 'https:')
        )
          throw new Error();
      }
      for (const key of [
        'MEDIA_S3_BUCKET',
        'MEDIA_S3_ACCESS_KEY',
        'MEDIA_S3_SECRET_KEY',
      ])
        if (!this.config.get<string>(key)) throw new Error();
      if (this.publicBase.length > 700) throw new Error();
    } catch {
      throw new ServiceUnavailableException({
        code: 'MEDIA_UNAVAILABLE',
        message: 'Image storage is not configured',
      });
    }
  }
  private get s3(): S3Client {
    this.assertConfigured();
    return (this.client ??= new S3Client({
      endpoint: this.config.getOrThrow<string>('MEDIA_S3_ENDPOINT'),
      region: this.config.get<string>('MEDIA_S3_REGION', 'us-east-1'),
      forcePathStyle: true,
      maxAttempts: 1,
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('MEDIA_S3_ACCESS_KEY'),
        secretAccessKey: this.config.getOrThrow<string>('MEDIA_S3_SECRET_KEY'),
      },
    }));
  }
  url(key: string): string {
    return `${this.publicBase}/${key}`;
  }
  async put(key: string, bytes: Buffer): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.config.getOrThrow<string>('MEDIA_S3_BUCKET'),
        Key: key,
        Body: bytes,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=300',
      }),
      { abortSignal: AbortSignal.timeout(15000) },
    );
  }
  async remove(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.config.getOrThrow<string>('MEDIA_S3_BUCKET'),
        Key: key,
      }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
  }
  onModuleDestroy(): void {
    this.client?.destroy();
  }
}
