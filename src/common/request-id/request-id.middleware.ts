import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestWithId = Request & {
  requestId: string;
};

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestIdMiddleware.name);
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const requestId = randomUUID();

    request.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);

    const startedAt = Date.now();

    response.on('finish', () => {
      const duration = Date.now() - startedAt;

      this.logger.log(
        `${request.method} ${request.originalUrl} ${response.statusCode} ${duration}ms requestId=${requestId}`,
      );
    });

    next();
  }
}
