import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { MockPaymentWebhookDto } from './dto/mock-payment-webhook.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createForOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        totalAmount: true,
        status: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Order is not available for payment');
    }

    const payment = await this.prisma.payment.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id, amount: order.totalAmount },
      update: {},
      select: {
        id: true,
        orderId: true,
        amount: true,
        status: true,
        provider: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (payment.status !== PaymentStatus.FAILED) {
      return payment;
    }

    const retriedPayment = await this.prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: PaymentStatus.FAILED,
        order: {
          userId,
          status: OrderStatus.PENDING,
        },
      },
      data: {
        status: PaymentStatus.PENDING,
      },
    });

    if (retriedPayment.count !== 1) {
      throw new BadRequestException('Payment is not available for retry');
    }

    return this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: {
        id: true,
        orderId: true,
        amount: true,
        status: true,
        provider: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async confirmPayment(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        order: {
          userId,
        },
      },
      select: {
        id: true,
        status: true,
        orderId: true,
        amount: true,
        provider: true,
        createdAt: true,
        updatedAt: true,
        order: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === PaymentStatus.SUCCEEDED) {
      return {
        id: payment.id,
        orderId: payment.orderId,
        amount: payment.amount,
        status: payment.status,
        provider: payment.provider,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      };
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(
        'Payment is not available for confirmation',
      );
    }

    if (payment.order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Order is not available for payment confirmation',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.SUCCEEDED,
        },
      });

      if (updatedPayment.count !== 1) {
        throw new BadRequestException(
          'Payment is not available for confirmation',
        );
      }

      const updatedOrder = await tx.order.updateMany({
        where: { id: payment.order.id, userId, status: OrderStatus.PENDING },
        data: {
          status: OrderStatus.PROCESSING,
        },
      });
      if (updatedOrder.count !== 1) {
        throw new BadRequestException('Order is not available for payment');
      }

      return tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        select: {
          id: true,
          orderId: true,
          amount: true,
          status: true,
          provider: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  }

  async failPayment(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        order: {
          userId,
        },
      },
      select: {
        id: true,
        status: true,
        order: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === PaymentStatus.FAILED) {
      return this.prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
        select: {
          id: true,
          orderId: true,
          amount: true,
          status: true,
          provider: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Payment is not available for failure');
    }

    if (payment.order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Order is not available for payment failure',
      );
    }

    const updatedPayment = await this.prisma.payment.updateMany({
      where: {
        id: payment.id,
        status: PaymentStatus.PENDING,
        order: { status: OrderStatus.PENDING },
      },
      data: {
        status: PaymentStatus.FAILED,
      },
    });

    if (updatedPayment.count !== 1) {
      throw new BadRequestException('Payment is not available for failure');
    }

    return this.prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: {
        id: true,
        orderId: true,
        amount: true,
        status: true,
        provider: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async handleMockWebhook(
    webhookSecret: string | undefined,
    dto: MockPaymentWebhookDto,
  ) {
    this.validateMockWebhookSecret(webhookSecret);

    if (dto.status === PaymentStatus.PENDING) {
      throw new BadRequestException(
        'Webhook status must be SUCCEEDED or FAILED',
      );
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
      select: {
        id: true,
        status: true,
        order: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === dto.status) {
      return this.prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
        select: {
          id: true,
          orderId: true,
          amount: true,
          status: true,
          provider: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Payment is not available for update');
    }

    if (payment.order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Order is not available for payment update',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: dto.status },
      });

      if (updatedPayment.count !== 1) {
        throw new BadRequestException('Payment is not available for update');
      }

      if (dto.status === PaymentStatus.SUCCEEDED) {
        const updatedOrder = await tx.order.updateMany({
          where: { id: payment.order.id, status: OrderStatus.PENDING },
          data: { status: OrderStatus.PROCESSING },
        });

        if (updatedOrder.count !== 1) {
          throw new BadRequestException(
            'Order is not available for payment update',
          );
        }
      }

      return tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        select: {
          id: true,
          orderId: true,
          amount: true,
          status: true,
          provider: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  }

  private validateMockWebhookSecret(webhookSecret: string | undefined): void {
    const expectedSecret = this.configService.getOrThrow<string>(
      'MOCK_PAYMENT_WEBHOOK_SECRET',
    );

    if (!webhookSecret || webhookSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }
}
