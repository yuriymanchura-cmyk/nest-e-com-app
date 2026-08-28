import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: RedisClientType;

  constructor(private readonly configService: ConfigService) {
    this.client = createClient({
      url: this.configService.getOrThrow<string>('REDIS_URL'),
    });
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, { EX: ttlSeconds });
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async deleteByPattern(pattern: string): Promise<number> {
    let deletedCount = 0;

    for await (const keys of this.client.scanIterator({
      MATCH: pattern,
      COUNT: 100,
    })) {
      if (keys.length > 0) {
        deletedCount += await this.client.del(keys);
      }
    }

    return deletedCount;
  }

  async incrementRateLimit(
    key: string,
    ttlMilliseconds: number,
    limit: number,
    blockDurationMilliseconds: number,
  ): Promise<{
    totalHits: number;
    timeToExpireMilliseconds: number;
    isBlocked: boolean;
    timeToBlockExpireMilliseconds: number;
  }> {
    const result = await this.client.eval(
      `
      local hitsKey = KEYS[1]
      local blockKey = KEYS[2]

      local ttl = tonumber(ARGV[1])
      local limit = tonumber(ARGV[2])
      local blockDuration = tonumber(ARGV[3])

      local blockTtl = redis.call('PTTL', blockKey)

      if blockTtl > 0 then
        local currentHits = tonumber(redis.call('GET', hitsKey) or '0')
        return { currentHits, redis.call('PTTL', hitsKey), 1, blockTtl }
      end

      local totalHits = redis.call('INCR', hitsKey)

      if totalHits == 1 then
        redis.call('PEXPIRE', hitsKey, ttl)
      end

      local hitsTtl = redis.call('PTTL', hitsKey)

      if totalHits > limit then
        local effectiveBlockDuration = blockDuration > 0 and blockDuration or ttl

        redis.call('SET', blockKey, '1', 'PX', effectiveBlockDuration)

        return { totalHits, hitsTtl, 1, effectiveBlockDuration }
      end

      return { totalHits, hitsTtl, 0, 0 }
    `,
      {
        keys: [`throttle:${key}:hits`, `throttle:${key}:block`],
        arguments: [
          ttlMilliseconds.toString(),
          limit.toString(),
          blockDurationMilliseconds.toString(),
        ],
      },
    );

    const [
      totalHits,
      timeToExpireMilliseconds,
      isBlocked,
      timeToBlockExpireMilliseconds,
    ] = result as [number, number, number, number];

    return {
      totalHits,
      timeToExpireMilliseconds,
      isBlocked: isBlocked === 1,
      timeToBlockExpireMilliseconds,
    };
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}
