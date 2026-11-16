import { randomUUID } from "node:crypto";
import { MomentService, rrf } from "./moment.service.js";
import { SearchMomentsDto } from "./moment.dto.js";
import { processImage } from "./image.policy.js";
import sharp from "sharp";

const row = (id = randomUUID()) => ({
  id,
  asset_id: randomUUID(),
  owner_id: randomUUID(),
  asset_version: 1,
  state: "active" as const,
  caption: "biển",
  tags: [],
  captured_at: new Date(),
  album_id: null,
  place: "Đà Nẵng",
  object_key: "private/key",
  checksum: "checksum",
  index_status: "ready" as const,
});

describe("moment search final authority", () => {
  it("filters stale/deleted candidates and never exposes payload or object keys", async () => {
    const a = row(),
      b = row(),
      stale = row();
    const repo = {
      metadata: vi.fn().mockResolvedValue([a]),
      hydrate: vi.fn().mockResolvedValue([a, b, stale]),
    };
    const ai = {
      search: vi.fn().mockResolvedValue([
        { assetId: b.asset_id, assetVersion: 1 },
        { assetId: stale.asset_id, assetVersion: 2 },
        { assetId: randomUUID(), assetVersion: 1 },
      ]),
    };
    const service = new MomentService(repo as never, {} as never, ai as never);
    const result = await service.search(
      a.owner_id,
      Object.assign(new SearchMomentsDto(), { query: "biển" }),
    );
    expect(result.items.map((x) => x.id)).toEqual(
      expect.arrayContaining([a.id, b.id]),
    );
    expect(result.items).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain("private/key");
    expect(repo.hydrate.mock.calls[0][0]).toBe(a.owner_id);
  });
  it("reports metadata fallback and fails requireSemantic", async () => {
    const a = row();
    const repo = {
      metadata: vi.fn().mockResolvedValue([a]),
      hydrate: vi.fn().mockResolvedValue([a]),
    };
    const service = new MomentService(
      repo as never,
      {} as never,
      { search: vi.fn().mockRejectedValue(new Error("secret")) } as never,
    );
    const dto = Object.assign(new SearchMomentsDto(), {
      query: "biển",
      place: "Đà Nẵng",
    });
    const result = await service.search(a.owner_id, dto);
    expect(result.mode).toBe("metadata_only");
    expect(result.appliedFilters.place).toBe("Đà Nẵng");
    await expect(
      service.search(a.owner_id, { ...dto, requireSemantic: true }),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("does not turn metadata authority outages into empty success", async () => {
    const service = new MomentService(
      { metadata: vi.fn().mockRejectedValue(new Error("db")) } as never,
      {} as never,
      { search: vi.fn().mockResolvedValue([]) } as never,
    );
    await expect(
      service.search(
        randomUUID(),
        Object.assign(new SearchMomentsDto(), { query: "biển" }),
      ),
    ).rejects.toThrow();
  });
  it("rechecks lifecycle after reading private image", async () => {
    const m = row();
    const repo = {
      get: vi
        .fn()
        .mockResolvedValueOnce(m)
        .mockRejectedValueOnce(new Error("deleted")),
    };
    const service = new MomentService(
      repo as never,
      { get: vi.fn().mockResolvedValue(Buffer.from("bytes")) } as never,
      {} as never,
    );
    await expect(service.image(m.owner_id, m.id)).rejects.toThrow("deleted");
  });
  it("uses reciprocal ranks without mixing cosine and text scores", () => {
    expect(rrf(["a", "b"], ["b", "c"])).toEqual(["b", "a", "c"]);
    expect(rrf(["a", "a"], [])).toEqual(["a"]);
  });
});

describe("image policy", () => {
  it("rejects spoofed MIME, malformed content and oversized body", async () => {
    await expect(
      processImage(Buffer.from("<svg/>"), "image/jpeg"),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      processImage(Buffer.alloc(10 * 1024 * 1024 + 1), "image/jpeg"),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("preserves content aspect ratio and strips EXIF", async () => {
    const original = await sharp({
      create: { width: 300, height: 150, channels: 3, background: "blue" },
    })
      .jpeg()
      .withMetadata()
      .toBuffer();
    const output = await processImage(original, "image/jpeg");
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(150);
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe("jpeg");
  });
  it("rejects a tiny file whose decoded image exceeds axis limits", async () => {
    const bytes = await sharp({
      create: { width: 12001, height: 1, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(processImage(bytes, "image/png")).rejects.toMatchObject({
      status: 400,
    });
  });
});
