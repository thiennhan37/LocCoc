import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { ServiceProxyController } from "../src/service-proxy.controller.js";
import { configureGateway } from "../src/bootstrap.js";

describe("moment gateway contract", () => {
  let app: INestApplication;
  const upstream = vi.fn<typeof fetch>();
  beforeEach(async () => {
    vi.stubGlobal("fetch", upstream);
    upstream
      .mockReset()
      .mockResolvedValue(new Response('{"items":[]}', { status: 200 }));
    const config = {
      MOMENT_SERVICE_URL: "http://moments:8088",
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
  it("routes JSON search preserving prefix/auth and stripping service capabilities", async () => {
    await request(app.getHttpServer())
      .post("/moments/search")
      .set("authorization", "Bearer user")
      .set("x-service-token", "spoof")
      .set("x-ai-actor", "spoof")
      .send({ query: "biển" })
      .expect(200);
    const [url, init] = upstream.mock.calls[0]!;
    expect(String(url)).toBe("http://moments:8088/moments/search");
    const headers = init!.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer user");
    expect(headers.has("x-service-token")).toBe(false);
    expect(headers.has("x-ai-actor")).toBe(false);
  });
  it("forwards upload bytes with 10 MiB cap and never exposes legacy AI APIs", async () => {
    const path = "/moments/11111111-1111-4111-8111-111111111111/image";
    const bytes = Buffer.from([255, 216, 255, 0, 128]);
    await request(app.getHttpServer())
      .put(path)
      .set("content-type", "image/jpeg")
      .send(bytes)
      .expect(200);
    expect(Buffer.from(upstream.mock.calls[0]![1]!.body as Uint8Array)).toEqual(
      bytes,
    );
    await request(app.getHttpServer())
      .put(path)
      .set("content-type", "image/jpeg")
      .send(Buffer.alloc(10 * 1024 * 1024 + 1))
      .expect(413);
    await request(app.getHttpServer())
      .post("/ai/internal/search")
      .send({})
      .expect(404);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
