import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { ProductsRepository } from './products.repository';

@Module({
  imports: [PrismaModule, AuthModule, RedisModule],
  providers: [ProductsService, ProductsRepository],
  controllers: [ProductsController],
})
export class ProductsModule {}
