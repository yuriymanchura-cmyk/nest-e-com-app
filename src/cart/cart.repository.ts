import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const cartSelect = {
  id: true,
  items: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      quantity: true,
      product: { select: { id: true, name: true, slug: true, price: true } },
    },
  },
};

@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCartByUserId(userId: string) {
    return this.prisma.cart.findUnique({
      where: { userId },
      select: cartSelect,
    });
  }

  findProductForCart(productId: string) {
    return this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, stock: true, isActive: true },
    });
  }

  getOrCreateCart(userId: string) {
    return this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
  }

  findItemQuantity(cartId: string, productId: string) {
    return this.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId, productId } },
      select: { quantity: true },
    });
  }

  addOrIncrementItem(cartId: string, productId: string, quantity: number) {
    return this.prisma.cartItem.upsert({
      where: { cartId_productId: { cartId, productId } },
      create: { cartId, productId, quantity },
      update: { quantity: { increment: quantity } },
    });
  }

  findItemWithOwnerAndProduct(itemId: string) {
    return this.prisma.cartItem.findUnique({
      where: { id: itemId },
      select: {
        cart: { select: { userId: true } },
        product: { select: { stock: true, isActive: true } },
      },
    });
  }

  findItemWithOwner(itemId: string) {
    return this.prisma.cartItem.findUnique({
      where: { id: itemId },
      select: { cart: { select: { userId: true } } },
    });
  }

  updateItemQuantity(itemId: string, quantity: number) {
    return this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  }

  deleteItem(itemId: string) {
    return this.prisma.cartItem.delete({ where: { id: itemId } });
  }

  clearCart(userId: string) {
    return this.prisma.cartItem.deleteMany({ where: { cart: { userId } } });
  }
}
