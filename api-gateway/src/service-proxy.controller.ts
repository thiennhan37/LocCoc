import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { RequestWithId } from '@loccoc/common';
import { SERVICE_ROUTES, type ServiceName } from './service-routes.js';

// Hop-by-hop headers: headers that are not forwarded from the client to the server
const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length',
]);

@Controller()
export class ServiceProxyController {
  constructor(private readonly config: ConfigService) {}

  @All('auth/*path')
  forwardToAuth(@Req() request: RequestWithId, @Res() response: Response): Promise<void> {
    return this.forward('auth', request, response);
  }

  @All('users/*path')
  forwardToUsers(@Req() request: RequestWithId, @Res() response: Response): Promise<void> {
    return this.forward('users', request, response);
  }

  private async forward(service: ServiceName, request: RequestWithId, response: Response): Promise<void> {
    // Create targetURL for request
    const route = SERVICE_ROUTES[service];
    const baseUrl = this.config.getOrThrow<string>(route.urlConfigKey).replace(/\/$/, '');
    const path = this.getPath(request);
    const target = new URL(`${baseUrl}${route.prefix}/${path}`);
    // append query params from originalUrl to targetURL
    target.search = new URL(request.originalUrl, 'http://gateway.internal').search;

    // eliminate HOP_BY_HOP_HEADERS and copy headers from request to headers
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (HOP_BY_HOP_HEADERS.has(name.toLowerCase()) || Array.isArray(value) || value === undefined) continue;
      headers.set(name, value);
    }
    headers.set('x-request-id', request.requestId);

    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const body = hasBody && request.body !== undefined ? JSON.stringify(request.body) : undefined;
    if (body && !headers.has('content-type')) headers.set('content-type', 'application/json');

    try {
      const upstream = await fetch(target, { method: request.method, headers, body, redirect: 'manual' });
      response.status(upstream.status);
      upstream.headers.forEach((value, name) => {
        if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) response.setHeader(name, value);
      });
      response.send(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      response.status(502).json({
        statusCode: 502,
        error: 'Bad Gateway',
        message: 'Upstream service unavailable',
        requestId: request.requestId,
      });
    }
  }

  private getPath(request: RequestWithId): string {
    const wildcard = request.params?.path;
    return Array.isArray(wildcard) ? wildcard.join('/') : String(wildcard ?? '').replace(/^\//, '');
  }
}
