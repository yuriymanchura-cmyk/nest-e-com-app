import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { RedisService } from '../redis/redis.service';
import { RestockProductDto } from './dto/restock-product.dto';
import { InventoryRepository } from './inventory.repository';

const ACTIVE_PRODUCTS_CATALOG_CACHE_PATTERN = 'products:active:catalog:*';

@Injectable()
export class InventoryService {
  constructor(
    private readonly inventoryRepository: InventoryRepository,
    private readonly redis: RedisService,
  ) {}

  async restock(
    productId: string,
    actorUserId: string,
    dto: RestockProductDto,
  ) {
    try {
      const result = await this.inventoryRepository.restock(
        productId,
        actorUserId,
        dto.quantity,
      );

      await Promise.all([
        this.redis.deleteByPattern(ACTIVE_PRODUCTS_CATALOG_CACHE_PATTERN),
        this.redis.del(this.getActiveProductCacheKey(result.product.slug)),
      ]);

      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Product not found');
      }

      throw error;
    }
  }

  private getActiveProductCacheKey(slug: string): string {
    return `products:active:slug:${slug}:v1`;
  }
}
