import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  GetBucketPolicyCommand,
  GetBucketAclCommand,
} from "@aws-sdk/client-s3";

@Injectable()
export class MomentStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>("MOMENTS_S3_BUCKET");
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>("MOMENTS_S3_ENDPOINT"),
      region: config.get<string>("MOMENTS_S3_REGION", "us-east-1"),
      forcePathStyle: true,
      maxAttempts: 1,
      credentials: {
        accessKeyId: config.getOrThrow<string>("MOMENTS_S3_ACCESS_KEY"),
        secretAccessKey: config.getOrThrow<string>("MOMENTS_S3_SECRET_KEY"),
      },
    });
  }
  async assertPrivate() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
        abortSignal: AbortSignal.timeout(2000),
      });
      const acl = await this.client.send(
        new GetBucketAclCommand({ Bucket: this.bucket }),
        { abortSignal: AbortSignal.timeout(2000) },
      );
      if (acl.Grants?.some((g) => g.Grantee?.URI?.includes("/global/")))
        throw new Error("Public bucket ACL");
      const policy = await this.client.send(
        new GetBucketPolicyCommand({ Bucket: this.bucket }),
        { abortSignal: AbortSignal.timeout(2000) },
      );
      // Conservative: any anonymous Allow is rejected, regardless of conditions.
      const document = JSON.parse(policy.Policy ?? "{}") as {
        Statement?: {
          Effect?: string;
          Principal?: unknown;
          NotPrincipal?: unknown;
        }[];
      };
      if (
        document.Statement?.some(
          (s) =>
            s.Effect === "Allow" &&
            (s.NotPrincipal !== undefined ||
              s.Principal === "*" ||
              JSON.stringify(s.Principal ?? null).includes('"*"')),
        )
      )
        throw new Error("Public bucket");
    } catch (e) {
      if ((e as { name?: string }).name === "NoSuchBucketPolicy") return;
      throw new ServiceUnavailableException(
        "Private moment storage is unavailable",
      );
    }
  }
  async onModuleInit() {
    await this.assertPrivate();
  }
  async put(key: string, bytes: Buffer) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: "image/jpeg",
        CacheControl: "private, no-store",
      }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
  }
  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
    if (!result.Body || (result.ContentLength ?? 0) > 2 * 1024 * 1024)
      throw new ServiceUnavailableException("Invalid stored image");
    const chunks: Buffer[] = [];
    let size = 0;
    const body = result.Body as AsyncIterable<Uint8Array> & {
      destroy?: (error?: Error) => void;
    };
    const timer = setTimeout(
      () => body.destroy?.(new Error("Storage stream timeout")),
      10000,
    );
    try {
      for await (const chunk of body) {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) {
          body.destroy?.();
          throw new ServiceUnavailableException("Invalid stored image");
        }
        chunks.push(Buffer.from(chunk));
      }
    } finally {
      clearTimeout(timer);
    }
    return Buffer.concat(chunks);
  }
  async remove(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
  }
  onModuleDestroy() {
    this.client.destroy();
  }
}
