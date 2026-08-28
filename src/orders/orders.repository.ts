import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const orderDetailsSelect = {
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
} satisfies Prisma.OrderSelect;

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(callback);
  }

  findByUserAndIdempotency(userId: string, idempotencyKey: string) {
    return this.prisma.order.findFirst({
      where: { userId, idempotencyKey },
      select: orderDetailsSelect,
    });
  }

  findCancelableOrder(userId: string, orderId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        status: true,
        items: { select: { productId: true, quantity: true } },
      },
    });
  }

  findMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        subtotal: true,
        totalAmount: true,
        createdAt: true,
      },
    });
  }

  findMyOrder(userId: string, id: string) {
    return this.prisma.order.findFirst({
      where: { id, userId },
      select: orderDetailsSelect,
    });
  }

  findForStatusUpdate(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
      select: { status: true },
    });
  }

  updateStatus(id: string, status: OrderStatus) {
    return this.prisma.order.update({
      where: { id },
      data: { status },
      select: { id: true, status: true, updatedAt: true },
    });
  }

  findAllForAdmin() {
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        subtotal: true,
        totalAmount: true,
        createdAt: true,
        user: { select: { id: true, email: true } },
      },
    });
  }
}
