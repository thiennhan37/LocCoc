import { All, Controller, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';
import type { RequestWithId } from '@loccoc/common';
import { SERVICE_ROUTES, type ServiceName } from './service-routes.js';

const HOP_BY_HOP_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

const REQUEST_ONLY_HEADERS = new Set(['host', 'content-length', 'expect']);

@Controller()
export class ServiceProxyController {
  constructor(private readonly config: ConfigService) {}

  @All('auth/*path')
  forwardToAuth(@Req() request: RequestWithId, @Res() response: Response): Promise<void> {
    return this.forwardJson('auth', request, response);
  }

  @All('users/*path')
  forwardToUsers(@Req() request: RequestWithId, @Res() response: Response): Promise<void> {
    return this.forwardJson('users', request, response);
  }

  @All('ai/*path')
  forwardToAi(@Req() request: RequestWithId, @Res() response: Response): Promise<void> {
    return this.forwardRaw('ai', request, response);
  }

  private async forwardJson(service: ServiceName, request: RequestWithId, response: Response): Promise<void> {
    const target = this.buildTarget(service, request);
    const headers = this.buildRequestHeaders(request);

    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const body = hasBody && request.body !== undefined ? JSON.stringify(request.body) : undefined;
    if (body && !headers.has('content-type')) headers.set('content-type', 'application/json');

    try {
      const upstream = await fetch(target, { method: request.method, headers, body, redirect: 'manual' });
      response.status(upstream.status);
      this.copyResponseHeaders(upstream.headers, response);
      response.send(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      this.handleUpstreamError(error, request, response);
    }
  }

  private async forwardRaw(service: ServiceName, request: RequestWithId, response: Response): Promise<void> {
    const target = this.buildTarget(service, request);
    const headers = this.buildRequestHeaders(request);
    const hasBody = !['GET', 'HEAD'].includes(request.method);
    const abortController = new AbortController();
    let clientDisconnected = false;
    let responseFinished = false;

    const abortUpstream = () => {
      clientDisconnected = true;
      abortController.abort();
    };
    const markFinished = () => { responseFinished = true; };
    const abortOnPrematureClose = () => {
      if (!responseFinished) abortUpstream();
    };

    request.once('aborted', abortUpstream);
    response.once('finish', markFinished);
    response.once('close', abortOnPrematureClose);

    try {
      const init: RequestInit & { duplex?: 'half' } = {
        method: request.method,
        headers,
        body: hasBody ? request as unknown as BodyInit : undefined,
        redirect: 'manual',
        signal: abortController.signal,
      };
      if (hasBody) init.duplex = 'half';

      const upstream = await fetch(target, init);
      response.status(upstream.status);
      this.copyResponseHeaders(upstream.headers, response);

      if (!upstream.body) {
        response.end();
        return;
      }
      await pipeline(Readable.fromWeb(upstream.body as never), response);
    } catch (error) {
      if (clientDisconnected || abortController.signal.aborted) {
        if (!response.destroyed && !response.writableEnded) response.destroy();
        return;
      }
      this.handleUpstreamError(error, request, response);
    } finally {
      request.removeListener('aborted', abortUpstream);
      response.removeListener('finish', markFinished);
      response.removeListener('close', abortOnPrematureClose);
    }
  }

  private buildTarget(service: ServiceName, request: RequestWithId): URL {
    const route = SERVICE_ROUTES[service];
    const baseUrl = this.config.getOrThrow<string>(route.urlConfigKey).replace(/\/$/, '');
    const target = new URL(`${baseUrl}${route.prefix}/${this.getPath(request)}`);
    target.search = new URL(request.originalUrl, 'http://gateway.internal').search;
    return target;
  }

  private buildRequestHeaders(request: RequestWithId): Headers {
    const headers = new Headers();
    const blocked = new Set([...HOP_BY_HOP_HEADERS, ...REQUEST_ONLY_HEADERS, ...this.connectionHeaderNames(request.headers.connection)]);
    for (const [name, value] of Object.entries(request.headers)) {
      if (blocked.has(name.toLowerCase()) || Array.isArray(value) || value === undefined) continue;
      headers.set(name, value);
    }
    headers.set('x-request-id', request.requestId);
    return headers;
  }

  private copyResponseHeaders(upstreamHeaders: Headers, response: Response): void {
    const blocked = new Set([...HOP_BY_HOP_HEADERS, ...this.connectionHeaderNames(upstreamHeaders.get('connection'))]);
    upstreamHeaders.forEach((value, name) => {
      if (!blocked.has(name.toLowerCase())) response.setHeader(name, value);
    });
  }

  private connectionHeaderNames(value: string | string[] | undefined | null): string[] {
    const header = Array.isArray(value) ? value.join(',') : value;
    return String(header ?? '').split(',').map((name) => name.trim().toLowerCase()).filter(Boolean);
  }

  private handleUpstreamError(error: unknown, request: RequestWithId, response: Response): void {
    if (response.headersSent) {
      response.destroy(error instanceof Error ? error : undefined);
      return;
    }
    response.setHeader('Cache-Control', 'no-store');
    response.status(502).json({
      statusCode: 502,
      error: 'Bad Gateway',
      message: 'Upstream service unavailable',
      requestId: request.requestId,
    });
  }

  private getPath(request: RequestWithId): string {
    const wildcard = request.params?.path;
    return Array.isArray(wildcard) ? wildcard.join('/') : String(wildcard ?? '').replace(/^\//, '');
  }
}
