import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from '../interfaces/request-with-id.js';

// Global Exception Filter
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<RequestWithId>();
    const statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (statusCode >= 500) this.logger.error({ requestId: request.requestId, statusCode, path: request.path });

    let message: string | string[] = 'Request failed';
    if (statusCode === 500) message = 'Internal server error';
    else if (statusCode === 429) message = 'Too many requests';
    else if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      message = typeof payload === 'object' && payload && 'message' in payload
        ? (payload.message as string | string[]) : exception.message;
    }
    response.status(statusCode).json({
      statusCode,
      error: HttpStatus[statusCode] ?? 'Error',
      message,
      requestId: request.requestId,
    });
  }
}
