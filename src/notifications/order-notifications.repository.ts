import { Injectable } from '@nestjs/common';
import { NotificationStatus, OrderStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

export const ORDER_PAID_CONFIRMATION = 'ORDER_PAID_CONFIRMATION';

@Injectable()
export class OrderNotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProcessingOrder(id: string) {
    return this.prisma.order.findUnique({
      where: { id, status: OrderStatus.PROCESSING },
      select: {
        subtotal: true,
        totalAmount: true,
        user: { select: { email: true } },
        items: {
          select: { productName: true, quantity: true, lineTotal: true },
        },
      },
    });
  }

  createOrFindPaidConfirmation(orderId: string) {
    return this.prisma.orderNotification.upsert({
      where: { orderId_type: { orderId, type: ORDER_PAID_CONFIRMATION } },
      create: { orderId, type: ORDER_PAID_CONFIRMATION },
      update: {},
      select: { id: true, status: true },
    });
  }

  markSent(id: string) {
    return this.prisma.orderNotification.update({
      where: { id },
      data: { status: NotificationStatus.SENT, sentAt: new Date() },
    });
  }

  markFailed(id: string) {
    return this.prisma.orderNotification.update({
      where: { id },
      data: { status: NotificationStatus.FAILED },
    });
  }
}
