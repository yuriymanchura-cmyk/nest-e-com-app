import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  getLiveness() {
    return {
      status: 'ok',
    };
  }

  async getHealth() {
    try {
      await Promise.all([this.prisma.$queryRaw`SELECT 1`, this.redis.ping()]);

      return {
        status: 'ok',
        database: 'up',
        redis: 'up',
      };
    } catch {
      throw new ServiceUnavailableException(
        'Service dependencies are unavailable',
      );
    }
  }
}
