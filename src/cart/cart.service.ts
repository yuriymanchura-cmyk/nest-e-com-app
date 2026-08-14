import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            quantity: true,
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                price: true,
              },
            },
          },
        },
      },
    });
    return cart ?? { id: null, items: [] };
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: {
        id: true,
        stock: true,
        isActive: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!product.isActive) {
      throw new BadRequestException('Product is not available');
    }

    if (dto.quantity > product.stock) {
      throw new BadRequestException(
        'Requested quantity exceeds available stock',
      );
    }

    const cart = await this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });

    const existingItem = await this.prisma.cartItem.findUnique({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: product.id,
        },
      },
      select: {
        quantity: true,
      },
    });

    const totalQuantity = (existingItem?.quantity ?? 0) + dto.quantity;

    if (totalQuantity > product.stock) {
      throw new BadRequestException(
        'Requested quantity exceeds available stock',
      );
    }

    await this.prisma.cartItem.upsert({
      where: {
        cartId_productId: {
          cartId: cart.id,
          productId: product.id,
        },
      },
      create: {
        cartId: cart.id,
        productId: product.id,
        quantity: dto.quantity,
      },
      update: {
        quantity: {
          increment: dto.quantity,
        },
      },
    });

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      select: {
        cart: {
          select: {
            userId: true,
          },
        },
        product: {
          select: {
            stock: true,
            isActive: true,
          },
        },
      },
    });

    if (!item || item.cart.userId !== userId) {
      throw new NotFoundException('Cart item not found');
    }

    if (!item.product.isActive) {
      throw new BadRequestException('Product is not available');
    }

    if (dto.quantity > item.product.stock) {
      throw new BadRequestException(
        'Requested quantity exceeds available stock',
      );
    }
    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: {
        quantity: dto.quantity,
      },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({
      where: { id: itemId },
      select: {
        cart: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!item || item.cart.userId !== userId) {
      throw new NotFoundException('Cart item not found');
    }

    await this.prisma.cartItem.delete({
      where: {
        id: itemId,
      },
    });

    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    await this.prisma.cartItem.deleteMany({
      where: {
        cart: {
          userId,
        },
      },
    });

    return this.getCart(userId);
  }
}
