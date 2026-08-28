import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler/dist/throttler.guard.interface';
import type { Response } from 'express';

@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const response = context.switchToHttp().getResponse<Response>();
    const retryAfter =
      throttlerLimitDetail.timeToBlockExpire ||
      throttlerLimitDetail.timeToExpire;

    response.setHeader('Retry-After', retryAfter.toString());

    throw new ThrottlerException('Too many requests. Try again later.');
  }
}
