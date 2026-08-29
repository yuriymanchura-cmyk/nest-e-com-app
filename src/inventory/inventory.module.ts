import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { InventoryController } from './inventory.controller';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';

@Module({
  imports: [PrismaModule, AuthModule, RedisModule],
  providers: [InventoryService, InventoryRepository],
  controllers: [InventoryController],
})
export class InventoryModule {}
