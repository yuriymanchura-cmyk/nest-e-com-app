import {
  HttpStatus,
  Logger,
  NotFoundException,
  type ArgumentsHost,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function createHost() {
  const json = jest.fn();
  const response = {
    status: jest.fn().mockReturnThis(),
    json,
  };
  const request = {
    requestId: 'request-id',
    method: 'GET',
    originalUrl: '/products/does-not-exist',
  };
  const host = {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, json, request, response };
}

describe('HttpExceptionFilter', () => {
  it('formats an HTTP exception with correlation details', () => {
    const filter = new HttpExceptionFilter();
    const { host, json, request, response } = createHost();

    filter.catch(new NotFoundException('Product not found'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Product not found',
        error: 'Not Found',
        requestId: request.requestId,
        path: request.originalUrl,
      }),
    );
  });

  it('hides an unexpected error behind a safe 500 response', () => {
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const filter = new HttpExceptionFilter();
    const { host, json, request, response } = createHost();

    filter.catch(new Error('Database password leaked'), host);

    expect(response.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: 'Internal Server Error',
        requestId: request.requestId,
        path: request.originalUrl,
      }),
    );

    expect(loggerError).toHaveBeenCalledWith(
      expect.stringContaining(`requestId=${request.requestId}`),
      expect.stringContaining('Database password leaked'),
    );

    loggerError.mockRestore();
  });
});
