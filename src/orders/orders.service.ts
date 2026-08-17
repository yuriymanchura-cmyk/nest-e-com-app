import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { isUUID } from 'class-validator';

@Injectable()
export class OrdersService {
  private readonly orderDetailsSelect = {
    id: true,
    status: true,
    subtotal: true,
    totalAmount: true,
    createdAt: true,
    items: {
      select: {
        id: true,
        productId: true,
        productName: true,
        unitPrice: true,
        quantity: true,
        lineTotal: true,
      },
    },
  };

  constructor(private readonly prisma: PrismaService) {}

  async checkout(userId: string, idempotencyKey: string) {
    if (!isUUID(idempotencyKey, '4')) {
      throw new BadRequestException('Invalid Idempotency-Key');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: {
            isActive: true,
          },
        });

        if (!user || !user.isActive) {
          throw new UnauthorizedException();
        }

        const existingOrder = await tx.order.findFirst({
          where: { userId, idempotencyKey },
          select: this.orderDetailsSelect,
        });

        if (existingOrder) {
          return existingOrder;
        }

        const cart = await tx.cart.findUnique({
          where: { userId },
          select: {
            id: true,
            items: {
              select: {
                id: true,
                quantity: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    price: true,
                    stock: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        });

        if (!cart || cart.items.length === 0) {
          throw new BadRequestException('Cart is empty');
        }

        for (const item of cart.items) {
          if (!item.product.isActive) {
            throw new BadRequestException('Product is not available');
          }

          if (item.quantity > item.product.stock) {
            throw new BadRequestException('Insufficient product stock');
          }
        }

        const orderItems = cart.items.map((item) => {
          const lineTotal = item.product.price.mul(item.quantity);

          return {
            productId: item.product.id,
            productName: item.product.name,
            unitPrice: item.product.price,
            quantity: item.quantity,
            lineTotal,
          };
        });

        const subtotal = orderItems.reduce(
          (total, item) => total.add(item.lineTotal),
          new Prisma.Decimal(0),
        );

        const totalAmount = subtotal;

        const order = await tx.order.create({
          data: {
            userId,
            subtotal,
            totalAmount,
            idempotencyKey,
            items: {
              create: orderItems,
            },
          },
          select: this.orderDetailsSelect,
        });

        for (const item of cart.items) {
          const updatedProduct = await tx.product.updateMany({
            where: {
              id: item.product.id,
              isActive: true,
              stock: {
                gte: item.quantity,
              },
            },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });
          if (updatedProduct.count !== 1) {
            throw new BadRequestException('Insufficient product stock');
          }
        }

        await tx.cartItem.deleteMany({
          where: {
            cartId: cart.id,
          },
        });

        return order;
      });
    } catch (error: unknown) {
      const existingOrder = await this.prisma.order.findFirst({
        where: { userId, idempotencyKey },
        select: this.orderDetailsSelect,
      });

      if (existingOrder) {
        return existingOrder;
      }

      throw error;
    }
  }

  async cancel(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        status: true,
        items: {
          select: {
            productId: true,
            quantity: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Order cannot be canceled');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.updateMany({
        where: { id: order.id, userId, status: OrderStatus.PENDING },
        data: {
          status: OrderStatus.CANCELED,
        },
      });

      if (updatedOrder.count !== 1) {
        throw new BadRequestException('Order cannot be canceled');
      }

      for (const item of order.items) {
        await tx.product.update({
          where: {
            id: item.productId,
          },
          data: {
            stock: {
              increment: item.quantity,
            },
          },
        });
      }
      return tx.order.findUniqueOrThrow({
        where: {
          id: order.id,
        },
        select: {
          id: true,
          status: true,
          updatedAt: true,
        },
      });
    });
  }

  async findMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        status: true,
        subtotal: true,
        totalAmount: true,
        createdAt: true,
      },
    });
  }

  async findMyOrder(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: {
        id,
        userId,
      },
      select: this.orderDetailsSelect,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({
      where: {
        id,
      },
      select: {
        status: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      PENDING: [OrderStatus.PROCESSING],
      PROCESSING: [OrderStatus.SHIPPED],
      SHIPPED: [OrderStatus.DELIVERED],
      DELIVERED: [],
      CANCELED: [],
    };

    if (!allowedTransitions[order.status].includes(dto.status)) {
      throw new BadRequestException('Invalid order status transition');
    }

    return this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
      },
      select: {
        id: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  async findAllForAdmin() {
    return this.prisma.order.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        status: true,
        subtotal: true,
        totalAmount: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });
  }
}
