import {
  BadRequestException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Request } from "express";
import sharp from "sharp";

export const UPLOAD_LIMIT = 10 * 1024 * 1024;
let decoders = 0;
let readers = 0;

export async function readImage(request: Request): Promise<Buffer> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(
      request.headers["content-type"] ?? "",
    ) ||
    request.headers["content-encoding"]
  )
    throw new BadRequestException("Use JPEG, PNG or WebP");
  if (Number(request.headers["content-length"]) > UPLOAD_LIMIT) {
    request.resume();
    throw new PayloadTooLargeException();
  }
  if (readers >= 4) {
    request.resume();
    throw new ServiceUnavailableException("Upload processing is busy");
  }
  readers++;
  const chunks: Buffer[] = [];
  let size = 0;
  const timer = setTimeout(() => request.destroy(), 30000);
  try {
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > UPLOAD_LIMIT) {
        request.resume();
        throw new PayloadTooLargeException();
      }
      chunks.push(bytes);
    }
    return Buffer.concat(chunks);
  } finally {
    readers--;
    clearTimeout(timer);
  }
}

export function rasterMime(b: Buffer) {
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255)
    return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (
    b.length >= 12 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return undefined;
}

export async function processImage(
  bytes: Buffer,
  mime: string,
): Promise<Buffer> {
  if (bytes.length > UPLOAD_LIMIT) throw new PayloadTooLargeException();
  if (!bytes.length || rasterMime(bytes) !== mime)
    throw new BadRequestException("Invalid image");
  if (decoders >= 2)
    throw new ServiceUnavailableException("Image processing is busy");
  decoders++;
  try {
    const image = sharp(bytes, {
      animated: true,
      limitInputPixels: 40_000_000,
      failOn: "warning",
    }).timeout({ seconds: 10 });
    const meta = await image.metadata();
    if (
      !meta.width ||
      !meta.height ||
      Math.max(meta.width, meta.height) > 12000 ||
      meta.width * meta.height > 40_000_000 ||
      (meta.pages ?? 1) !== 1
    )
      throw new Error();
    const output = await image
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize(1536, 1536, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    if (output.length > 2 * 1024 * 1024) throw new Error();
    return output;
  } catch {
    throw new BadRequestException("Invalid single-frame image");
  } finally {
    decoders--;
  }
}
