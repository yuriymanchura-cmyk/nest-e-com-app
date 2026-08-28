import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const paymentResponseSelect = {
  id: true,
  orderId: true,
  amount: true,
  status: true,
  provider: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

@Injectable()
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  transaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(callback);
  }

  findOwnedOrder(orderId: string, userId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true, totalAmount: true, status: true },
    });
  }

  upsertStripePayment(orderId: string, amount: Prisma.Decimal) {
    return this.prisma.payment.upsert({
      where: { orderId },
      create: { orderId, amount, provider: 'stripe' },
      update: { provider: 'stripe' },
      select: {
        id: true,
        orderId: true,
        amount: true,
        status: true,
        providerPaymentId: true,
      },
    });
  }

  updateProviderPaymentId(paymentId: string, providerPaymentId: string) {
    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { providerPaymentId },
    });
  }

  findByProviderPaymentId(providerPaymentId: string) {
    return this.prisma.payment.findUnique({
      where: { providerPaymentId },
      select: { id: true, status: true, orderId: true },
    });
  }

  upsertMockPayment(orderId: string, amount: Prisma.Decimal) {
    return this.prisma.payment.upsert({
      where: { orderId },
      create: { orderId, amount },
      update: {},
      select: paymentResponseSelect,
    });
  }

  retryFailedMockPayment(paymentId: string, userId: string) {
    return this.prisma.payment.updateMany({
      where: {
        id: paymentId,
        status: PaymentStatus.FAILED,
        order: { userId, status: OrderStatus.PENDING },
      },
      data: { status: PaymentStatus.PENDING },
    });
  }

  findPaymentResponse(paymentId: string) {
    return this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: paymentResponseSelect,
    });
  }

  findMockPaymentForOwner(paymentId: string, userId: string) {
    return this.prisma.payment.findFirst({
      where: { id: paymentId, provider: 'mock', order: { userId } },
      select: {
        ...paymentResponseSelect,
        order: { select: { id: true, status: true } },
      },
    });
  }

  findMockPayment(paymentId: string) {
    return this.prisma.payment.findUnique({
      where: { id: paymentId, provider: 'mock' },
      select: {
        id: true,
        status: true,
        order: { select: { id: true, status: true } },
      },
    });
  }
}
