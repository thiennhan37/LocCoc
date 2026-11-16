import { createHash, randomUUID } from "node:crypto";
import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { MomentRepository, type MomentRow } from "./moment.repository.js";
import { MomentStorage } from "./moment.storage.js";
import { AiClient } from "./ai.client.js";
import { processImage } from "./image.policy.js";
import type {
  CreateMomentDto,
  SearchMomentsDto,
  ListMomentsDto,
} from "./moment.dto.js";
import { resolveQuery } from "./search-query.js";

export function publicMoment(m: MomentRow) {
  return {
    id: m.id,
    caption: m.caption,
    tags: m.tags,
    capturedAt: m.captured_at.toISOString(),
    albumId: m.album_id,
    place: m.place,
    state: m.state,
    indexStatus: m.index_status,
    imagePath: m.state === "active" ? `/moments/${m.id}/image` : null,
  };
}

export function rrf(metadata: string[], semantic: string[]) {
  const scores = new Map<string, number>();
  for (const list of [metadata, semantic]) {
    [...new Set(list)].forEach((id, i) =>
      scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + i + 1)),
    );
  }
  return [...scores]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}

@Injectable()
export class MomentService {
  constructor(
    private readonly repo: MomentRepository,
    private readonly storage: MomentStorage,
    private readonly ai: AiClient,
  ) {}
  async create(owner: string, dto: CreateMomentDto) {
    return publicMoment(await this.repo.create(owner, dto));
  }
  async upload(owner: string, id: string, bytes: Buffer, mime: string) {
    const moment = await this.repo.get(owner, id, true);
    // A definitive retry after a lost upload response returns the existing asset.
    if (moment.state === "active") return publicMoment(moment);
    const image = await processImage(bytes, mime);
    const key = `moments/${owner}/${moment.asset_id}/${randomUUID()}.jpg`;
    await this.repo.stage(key, owner);
    await this.storage.put(key, image).catch(() => {
      throw new ServiceUnavailableException(
        "Private image storage is unavailable",
      );
    });
    // A failed/ambiguous commit leaves the object in the staging ledger.
    // Cleanup only removes entries that are not referenced by active metadata.
    return publicMoment(
      await this.repo.activate(
        owner,
        id,
        key,
        createHash("sha256").update(image).digest("hex"),
      ),
    );
  }
  async list(owner: string, dto: ListMomentsDto) {
    const page = await this.repo.list(owner, dto);
    return { items: page.items.map(publicMoment), nextCursor: page.nextCursor };
  }
  async get(owner: string, id: string) {
    return publicMoment(await this.repo.get(owner, id, true));
  }
  async remove(owner: string, id: string) {
    await this.repo.remove(owner, id);
    return { deleted: true };
  }
  async retry(owner: string, id: string) {
    await this.repo.retry(owner, id);
    return { indexStatus: "pending" };
  }
  async image(owner: string, id: string) {
    const m = await this.repo.get(owner, id);
    if (!m.object_key) throw new ServiceUnavailableException();
    const bytes = await this.storage.get(m.object_key).catch(() => {
      throw new ServiceUnavailableException(
        "Private image storage is unavailable",
      );
    });
    // Recheck after I/O so a deletion committed during download cannot grant a new read.
    await this.repo.get(owner, id);
    return bytes;
  }
  async search(owner: string, dto: SearchMomentsDto) {
    if (
      /[\u0000-\u001f\u007f]/u.test(dto.query) ||
      (dto.dateFrom &&
        dto.dateTo &&
        new Date(dto.dateFrom) > new Date(dto.dateTo))
    )
      throw new BadRequestException("Invalid query or date range");
    dto = resolveQuery(dto);
    const semanticWork = this.ai.search(owner, dto.query || "ảnh", dto).then(
      (items) => ({ items, available: true as const }),
      () => ({
        items: [] as { assetId: string; assetVersion: number }[],
        available: false as const,
      }),
    );
    const [metadata, semantic] = await Promise.all([
      this.repo.metadata(owner, dto, dto.query),
      semanticWork,
    ]);
    if (!semantic.available && dto.requireSemantic)
      throw new ServiceUnavailableException({
        code: "SEMANTIC_UNAVAILABLE",
        message: "Semantic search unavailable",
      });
    const versions = new Map(
      semantic.items.map((x) => [x.assetId, x.assetVersion]),
    );
    const assets = rrf(
      metadata.map((x) => x.asset_id),
      semantic.items.map((x) => x.assetId),
    );
    const fresh = await this.repo.hydrate(owner, dto, assets);
    const byAsset = new Map(fresh.map((x) => [x.asset_id, x]));
    const metaAssets = new Set(metadata.map((x) => x.asset_id));
    const items = assets
      .flatMap((asset) => {
        const row = byAsset.get(asset);
        if (
          !row ||
          (!metaAssets.has(asset) &&
            (row.index_status !== "ready" ||
              versions.get(asset) !== row.asset_version))
        )
          return [];
        return [publicMoment(row)];
      })
      .slice(0, dto.limit);
    return {
      items,
      mode: semantic.available ? "hybrid" : "metadata_only",
      semanticStatus: semantic.available ? "available" : "unavailable",
      ...(semantic.available ? {} : { reason: "SEMANTIC_UNAVAILABLE" }),
      appliedFilters: {
        albumId: dto.albumId ?? null,
        place: dto.place ?? null,
        dateFrom: dto.dateFrom ?? null,
        dateTo: dto.dateTo ?? null,
      },
      nextCursor: null,
      requestId: randomUUID(),
    };
  }
}
