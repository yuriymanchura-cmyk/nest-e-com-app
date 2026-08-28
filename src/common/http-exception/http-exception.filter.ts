import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from '../request-id/request-id.middleware';

type HttpExceptionResponse = {
  error?: string;
  message?: string | string[];
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithId>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      const errorResponse: HttpExceptionResponse =
        typeof exceptionResponse === 'string'
          ? { message: exceptionResponse }
          : exceptionResponse;

      response.status(statusCode).json({
        statusCode,
        message: errorResponse.message ?? exception.message,
        error: errorResponse.error ?? HttpStatus[statusCode],
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
        path: request.originalUrl,
      });

      return;
    }

    const error =
      exception instanceof Error ? exception : new Error(String(exception));

    this.logger.error(
      `Unhandled exception requestId=${request.requestId} ${request.method} ${request.originalUrl}`,
      error.stack,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }
}
