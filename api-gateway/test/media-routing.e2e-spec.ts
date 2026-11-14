import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { ServiceProxyController } from "../src/service-proxy.controller.js";
import { configureGateway } from "../src/bootstrap.js";

describe("binary profile media gateway", () => {
  let app: INestApplication;
  const upstream = vi.fn<typeof fetch>();
  beforeEach(async () => {
    vi.stubGlobal("fetch", upstream);
    upstream
      .mockReset()
      .mockImplementation(
        async () =>
          new Response('{"coverUrl":"https://media.test/new.webp"}', {
            status: 200,
          }),
      );
    const config = {
      USER_SERVICE_URL: "http://user-service:8081",
      CORS_ORIGINS: "https://app.test",
    };
    const module = await Test.createTestingModule({
      controllers: [ServiceProxyController],
      providers: [
        {
          provide: ConfigService,
          useValue: { getOrThrow: (key: keyof typeof config) => config[key] },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    configureGateway(app);
    await app.init();
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });
  it.each(["avatar", "cover"])(
    "preserves raw bytes and authorization for %s",
    async (kind) => {
      const bytes = Buffer.from([137, 80, 78, 71, 0, 255, 0, 127]);
      await request(app.getHttpServer())
        .put(`/users/me/media/${kind}`)
        .set("Content-Type", "image/png")
        .set("Authorization", "Bearer test")
        .send(bytes)
        .expect(200);
      const [target, init] = upstream.mock.calls[0]!;
      expect(String(target)).toBe(
        `http://user-service:8081/users/me/media/${kind}`,
      );
      expect(Buffer.from(init!.body as Uint8Array)).toEqual(bytes);
      expect((init!.headers as Headers).get("authorization")).toBe(
        "Bearer test",
      );
    },
  );
  it("permits cover bodies larger than the normal JSON limit", async () => {
    await request(app.getHttpServer())
      .put("/users/me/media/cover")
      .set("Content-Type", "image/jpeg")
      .send(Buffer.alloc(1024 * 1024 + 1))
      .expect(200);
  });
  it.each(["avatar", "cover"])(
    "rejects oversized %s without forwarding",
    async (kind) => {
      const bytes = Buffer.alloc(
        (kind === "avatar" ? 5 : 10) * 1024 * 1024 + 1,
      );
      await request(app.getHttpServer())
        .put(`/users/me/media/${kind}`)
        .set("Content-Type", "image/png")
        .send(bytes)
        .expect(413);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it("rejects SVG and compressed upload bodies", async () => {
    await request(app.getHttpServer())
      .put("/users/me/media/avatar")
      .set("Content-Type", "image/svg+xml")
      .send("<svg/>")
      .expect(400);
    await request(app.getHttpServer())
      .put("/users/me/media/avatar")
      .set("Content-Type", "image/png")
      .set("Content-Encoding", "gzip")
      .send("bad")
      .expect(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("keeps ordinary JSON routing unchanged and forwards DELETE", async () => {
    await request(app.getHttpServer())
      .delete("/users/me/media/cover")
      .expect(200);
    expect(upstream.mock.calls[0]![1]!.method).toBe("DELETE");
    await request(app.getHttpServer())
      .patch("/users/me")
      .send({ coverUrl: "" })
      .expect(200);
    expect(upstream.mock.calls[1]![1]!.body).toBe('{"coverUrl":""}');
  });
});
