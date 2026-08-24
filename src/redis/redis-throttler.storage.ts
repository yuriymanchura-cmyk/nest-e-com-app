import { Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from './redis.service';

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    void throttlerName;

    const record = await this.redisService.incrementRateLimit(
      key,
      ttl,
      limit,
      blockDuration,
    );

    return {
      totalHits: record.totalHits,
      timeToExpire: Math.max(
        0,
        Math.ceil(record.timeToExpireMilliseconds / 1000),
      ),
      isBlocked: record.isBlocked,
      timeToBlockExpire: Math.max(
        0,
        Math.ceil(record.timeToBlockExpireMilliseconds / 1000),
      ),
    };
  }
}
