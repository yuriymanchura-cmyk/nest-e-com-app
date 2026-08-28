import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import {
  ORDER_PAID_JOB,
  type OrderPaidJobData,
} from '../orders/jobs/order-paid.job';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums';
import { MockPaymentWebhookDto } from './dto/mock-payment-webhook.dto';
import { PaymentsRepository } from './payments.repository';
import { StripeService } from './stripe.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly configService: ConfigService,
    private readonly stripeService: StripeService,

    @InjectQueue('orders')
    private readonly ordersQueue: Queue<OrderPaidJobData>,
  ) {}

  async createStripePaymentIntent(userId: string, orderId: string) {
    const order = await this.paymentsRepository.findOwnedOrder(orderId, userId);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Order is not available for payment');
    }

    const payment = await this.paymentsRepository.upsertStripePayment(
      order.id,
      order.totalAmount,
    );

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Payment is not available for processing');
    }

    const paymentIntent = await this.stripeService.createPaymentIntent(
      payment.id,
      payment.orderId,
      payment.amount.toFixed(2),
    );

    await this.paymentsRepository.updateProviderPaymentId(
      payment.id,
      paymentIntent.id,
    );

    if (!paymentIntent.client_secret) {
      throw new ServiceUnavailableException(
        'Payment provider did not return a client secret',
      );
    }

    return {
      paymentId: payment.id,
      amount: payment.amount,
      currency: paymentIntent.currency,
      clientSecret: paymentIntent.client_secret,
    };
  }

  async handleStripeWebhook(
    payload: Buffer | undefined,
    signature: string | undefined,
  ) {
    if (!payload || !signature) {
      throw new UnauthorizedException('Invalid Stripe webhook signature');
    }

    const event = this.verifyStripeWebhookEvent(payload, signature);

    if (
      event.type !== 'payment_intent.succeeded' &&
      event.type !== 'payment_intent.payment_failed'
    ) {
      return { received: true };
    }

    const paymentIntent = event.data.object;

    const payment = await this.paymentsRepository.findByProviderPaymentId(
      paymentIntent.id,
    );

    if (!payment) {
      return { received: true };
    }

    const nextPaymentStatus =
      event.type === 'payment_intent.succeeded'
        ? PaymentStatus.SUCCEEDED
        : PaymentStatus.FAILED;

    const shouldEnqueueOrderPaidJob = await this.paymentsRepository.transaction(
      async (tx) => {
        const updatedPayment = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: {
            status: nextPaymentStatus,
          },
        });

        if (updatedPayment.count !== 1) {
          return (
            nextPaymentStatus === PaymentStatus.SUCCEEDED &&
            payment.status === PaymentStatus.SUCCEEDED
          );
        }

        if (nextPaymentStatus !== PaymentStatus.SUCCEEDED) {
          return false;
        }

        const updatedOrder = await tx.order.updateMany({
          where: { id: payment.orderId, status: OrderStatus.PENDING },
          data: {
            status: OrderStatus.PROCESSING,
          },
        });

        if (updatedOrder.count !== 1) {
          throw new BadRequestException(
            'Order is not available for processing',
          );
        }
        return true;
      },
    );

    if (shouldEnqueueOrderPaidJob) {
      await this.ordersQueue.add(
        ORDER_PAID_JOB,
        {
          orderId: payment.orderId,
          paymentId: payment.id,
        },
        {
          jobId: `order-paid-${payment.id}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );
    }

    return { received: true };
  }

  async createForOrder(userId: string, orderId: string) {
    const order = await this.paymentsRepository.findOwnedOrder(orderId, userId);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Order is not available for payment');
    }

    const payment = await this.paymentsRepository.upsertMockPayment(
      order.id,
      order.totalAmount,
    );

    if (payment.status !== PaymentStatus.FAILED) {
      return payment;
    }

    const retriedPayment = await this.paymentsRepository.retryFailedMockPayment(
      payment.id,
      userId,
    );

    if (retriedPayment.count !== 1) {
      throw new BadRequestException('Payment is not available for retry');
    }

    return this.paymentsRepository.findPaymentResponse(payment.id);
  }

  async confirmPayment(userId: string, paymentId: string) {
    const payment = await this.paymentsRepository.findMockPaymentForOwner(
      paymentId,
      userId,
    );

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

    return this.paymentsRepository.transaction(async (tx) => {
      const updatedPayment = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: PaymentStatus.PENDING,
          provider: 'mock',
        },
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
        where: {
          id: payment.order.id,
          userId,
          status: OrderStatus.PENDING,
        },
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
    const payment = await this.paymentsRepository.findMockPaymentForOwner(
      paymentId,
      userId,
    );

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === PaymentStatus.FAILED) {
      return this.paymentsRepository.findPaymentResponse(payment.id);
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Payment is not available for failure');
    }

    if (payment.order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Order is not available for payment failure',
      );
    }

    const updatedPayment = await this.paymentsRepository.transaction((tx) =>
      tx.payment.updateMany({
        where: {
          id: payment.id,
          status: PaymentStatus.PENDING,
          order: { status: OrderStatus.PENDING },
          provider: 'mock',
        },
        data: { status: PaymentStatus.FAILED },
      }),
    );

    if (updatedPayment.count !== 1) {
      throw new BadRequestException('Payment is not available for failure');
    }

    return this.paymentsRepository.findPaymentResponse(payment.id);
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

    const payment = await this.paymentsRepository.findMockPayment(
      dto.paymentId,
    );

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.status === dto.status) {
      return this.paymentsRepository.findPaymentResponse(payment.id);
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Payment is not available for update');
    }

    if (payment.order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        'Order is not available for payment update',
      );
    }

    return this.paymentsRepository.transaction(async (tx) => {
      const updatedPayment = await tx.payment.updateMany({
        where: {
          id: payment.id,
          provider: 'mock',
          status: PaymentStatus.PENDING,
        },
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

  private verifyStripeWebhookEvent(payload: Buffer, signature: string) {
    try {
      return this.stripeService.constructWebhookEvent(payload, signature);
    } catch {
      throw new UnauthorizedException('Invalid Stripe webhook signature');
    }
  }
}
