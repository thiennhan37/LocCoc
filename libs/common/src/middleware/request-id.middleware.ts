import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { RequestWithId } from '../interfaces/request-with-id.js';

export function requestIdMiddleware(request: RequestWithId, response: Response, next: NextFunction): void {
  request.requestId = randomUUID();
  response.setHeader('x-request-id', request.requestId);
  next();
}
