import {
  All,
  Controller,
  Req,
  Res,
  Put,
  PayloadTooLargeException,
  BadRequestException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import type { RequestWithId } from "@loccoc/common";
import type { AuthenticatedUser } from "@loccoc/common";
import { SERVICE_ROUTES, type ServiceName } from "./service-routes.js";

// Hop-by-hop headers: headers that are not forwarded from the client to the server
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

@Controller()
export class ServiceProxyController {
  constructor(private readonly config: ConfigService) {}

  @All("auth/*path")
  forwardToAuth(
    @Req() request: RequestWithId,
    @Res() response: Response,
  ): Promise<void> {
    return this.forward("auth", request, response);
  }

  @All(["notifications", "notifications/*path"])
  forwardNotifications(
    @Req() request: RequestWithId,
    @Res() response: Response,
  ): Promise<void> {
    return this.forward("notifications", request, response);
  }

  @Put("users/me/media/:kind")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  forwardMedia(
    @Req() request: RequestWithId,
    @Res() response: Response,
  ): Promise<void> {
    return this.forward("users", request, response);
  }

  @All("users/*path")
  forwardToUsers(
    @Req() request: RequestWithId,
    @Res() response: Response,
  ): Promise<void> {
    return this.forward("users", request, response);
  }

  @All("admin/*path")
  forwardToAdmin(
    @Req() request: RequestWithId,
    @Res() response: Response,
  ): Promise<void> {
    return this.forward("admin", request, response);
  }

  @All("payments/*path")
  forwardToPayments(
    @Req() request: RequestWithId,
    @Res() response: Response,
  ): Promise<void> {
    return this.forward("payments", request, response);
  }

  @All("subscriptions/*path")
  forwardToSubscriptions(
    @Req() request: RequestWithId,
    @Res() response: Response,
  ): Promise<void> {
    return this.forward("subscriptions", request, response);
  }

  @All(["ai", "ai/*path"])
  forwardToAi(
    @Req() request: RequestWithId,
    @Res() response: Response,
  ): Promise<void> {
    return this.forward("ai", request, response);
  }

  private async forward(
    service: ServiceName,
    request: RequestWithId,
    response: Response,
  ): Promise<void> {
    // Create targetURL for request
    const route = SERVICE_ROUTES[service];
    const baseUrl = this.config
      .getOrThrow<string>(route.urlConfigKey)
      .replace(/\/$/, "");
    const path = request.path.slice(route.prefix.length).replace(/^\//, "");
    const target = new URL(`${baseUrl}${route.prefix}/${path}`);
    // append query params from originalUrl to targetURL
    target.search = new URL(
      request.originalUrl,
      "http://gateway.internal",
    ).search;

    // eliminate HOP_BY_HOP_HEADERS and copy headers from request to headers
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (
        [
          "x-service-token",
          "x-user-id",
          "x-user-role",
          "x-user-roles",
        ].includes(name.toLowerCase())
      )
        continue;
      if (
        HOP_BY_HOP_HEADERS.has(name.toLowerCase()) ||
        ["x-forwarded-for", "x-real-ip"].includes(name.toLowerCase()) ||
        Array.isArray(value) ||
        value === undefined
      )
        continue;
      headers.set(name, value);
    }
    headers.set("x-request-id", request.requestId);
    const user = (request as RequestWithId & { user?: AuthenticatedUser }).user;
    if (user) {
      headers.set("x-user-id", user.userId);
      headers.set("x-user-role", user.role);
    }
    // Replace client-supplied forwarding headers with the gateway-derived IP.
    const clientIp = request.ip ?? request.socket.remoteAddress ?? "unknown";
    headers.set("x-forwarded-for", clientIp);
    headers.set("x-real-ip", clientIp);

    const hasBody = !["GET", "HEAD"].includes(request.method);
    const mediaUpload =
      request.method === "PUT" &&
      /^\/users\/me\/media\/(avatar|cover)$/.test(request.path);
    let body: string | Buffer | undefined =
      hasBody && request.body !== undefined
        ? JSON.stringify(request.body)
        : undefined;
    if (mediaUpload) {
      const mime = request.headers["content-type"];
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(mime ?? "") ||
        request.headers["content-encoding"]
      )
        throw new BadRequestException("Use JPEG, PNG or WebP");
      const limit = (request.path.endsWith("/avatar") ? 5 : 10) * 1024 * 1024;
      if (Number(request.headers["content-length"]) > limit) {
        await this.drainRejectedBody(request);
        throw new PayloadTooLargeException();
      }
      const chunks: Buffer[] = [];
      let length = 0;
      const timer = setTimeout(() => request.destroy(), 30000);
      try {
        for await (const chunk of request.iterator({
          destroyOnReturn: false,
        })) {
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
      body = Buffer.concat(chunks);
    }
    if (body && !headers.has("content-type"))
      headers.set("content-type", "application/json");

    try {
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body: Buffer.isBuffer(body) ? new Uint8Array(body) : body,
        redirect: "manual",
        signal: AbortSignal.timeout(mediaUpload ? 60000 : 15000),
      });
      response.status(upstream.status);
      upstream.headers.forEach((value, name) => {
        if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase()))
          response.setHeader(name, value);
      });
      response.send(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      response.status(502).json({
        statusCode: 502,
        error: "Bad Gateway",
        message: "Upstream service unavailable",
        requestId: request.requestId,
      });
    }
  }

  private async drainRejectedBody(request: RequestWithId): Promise<void> {
    // Drain without buffering so clients receive a 413 instead of a socket reset.
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        request.off("end", finish);
        request.off("error", finish);
        resolve();
      };
      const timer = setTimeout(finish, 2000);
      request.once("end", finish);
      request.once("error", finish);
      request.resume();
    });
  }
}
