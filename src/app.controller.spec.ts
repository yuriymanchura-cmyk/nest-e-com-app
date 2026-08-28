import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

describe('AppController', () => {
  let appController: AppController;

  const prismaService = {
    $queryRaw: jest.fn(),
  };

  const redisService = {
    ping: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: RedisService,
          useValue: redisService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
  describe('health', () => {
    it('should return liveness status without checking dependencies', () => {
      expect(appController.getLiveness()).toEqual({ status: 'ok' });
      expect(prismaService.$queryRaw).not.toHaveBeenCalled();
      expect(redisService.ping).not.toHaveBeenCalled();
    });

    it('should return dependency health status', async () => {
      prismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redisService.ping.mockResolvedValue('PONG');

      await expect(appController.getHealth()).resolves.toEqual({
        status: 'ok',
        database: 'up',
        redis: 'up',
      });
    });

    it('should throw when a dependency is unavailable', async () => {
      prismaService.$queryRaw.mockRejectedValue(new Error('Database is down'));
      redisService.ping.mockResolvedValue('PONG');

      await expect(appController.getHealth()).rejects.toThrow(
        'Service dependencies are unavailable',
      );
    });
  });
});
