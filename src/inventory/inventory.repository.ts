import { Injectable } from '@nestjs/common';
import { InventoryMovementType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async restock(productId: string, actorUserId: string, quantity: number) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id: productId },
        data: {
          stock: {
            increment: quantity,
          },
        },
        select: {
          id: true,
          slug: true,
          stock: true,
        },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          productId: product.id,
          actorUserId,
          type: InventoryMovementType.RESTOCK,
          quantity,
          stockBefore: product.stock - quantity,
          stockAfter: product.stock,
        },
        select: {
          id: true,
          type: true,
          quantity: true,
          stockBefore: true,
          stockAfter: true,
          createdAt: true,
        },
      });

      return { product, movement };
    });
  }
}
