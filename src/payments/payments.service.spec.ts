import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { ORDER_PAID_JOB } from '../orders/jobs/order-paid.job';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';

type TransactionClient = {
  payment: {
    updateMany: jest.Mock;
  };
  order: {
    updateMany: jest.Mock;
  };
};

type TransactionCallback = (tx: TransactionClient) => Promise<unknown>;

describe('PaymentsService', () => {
  let paymentsService: PaymentsService;

  const transactionClient: TransactionClient = {
    payment: {
      updateMany: jest.fn(),
    },
    order: {
      updateMany: jest.fn(),
    },
  };

  const prismaService = {
    payment: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const stripeService = {
    constructWebhookEvent: jest.fn(),
  };

  const ordersQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    prismaService.$transaction.mockImplementation(
      async (callback: TransactionCallback) => callback(transactionClient),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
        {
          provide: ConfigService,
          useValue: {},
        },
        {
          provide: StripeService,
          useValue: stripeService,
        },
        {
          provide: getQueueToken('orders'),
          useValue: ordersQueue,
        },
      ],
    }).compile();

    paymentsService = module.get<PaymentsService>(PaymentsService);
  });

  it('marks a pending Stripe payment as succeeded and starts its order', async () => {
    stripeService.constructWebhookEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_succeeded' } },
    });
    prismaService.payment.findUnique.mockResolvedValue({
      id: 'payment-id',
      status: PaymentStatus.PENDING,
      orderId: 'order-id',
    });
    transactionClient.payment.updateMany.mockResolvedValue({ count: 1 });
    transactionClient.order.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      paymentsService.handleStripeWebhook(
        Buffer.from('stripe-payload'),
        'stripe-signature',
      ),
    ).resolves.toEqual({ received: true });

    expect(prismaService.payment.findUnique).toHaveBeenCalledWith({
      where: { providerPaymentId: 'pi_succeeded' },
      select: {
        id: true,
        status: true,
        orderId: true,
      },
    });
    expect(transactionClient.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-id',
        status: PaymentStatus.PENDING,
      },
      data: { status: PaymentStatus.SUCCEEDED },
    });
    expect(transactionClient.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-id',
        status: OrderStatus.PENDING,
      },
      data: { status: OrderStatus.PROCESSING },
    });
    expect(ordersQueue.add).toHaveBeenCalledWith(
      ORDER_PAID_JOB,
      {
        orderId: 'order-id',
        paymentId: 'payment-id',
      },
      {
        jobId: 'order-paid-payment-id',
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    );
  });

  it('marks a pending Stripe payment as failed without starting its order', async () => {
    stripeService.constructWebhookEvent.mockReturnValue({
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_failed' } },
    });
    prismaService.payment.findUnique.mockResolvedValue({
      id: 'payment-id',
      status: PaymentStatus.PENDING,
      orderId: 'order-id',
    });
    transactionClient.payment.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      paymentsService.handleStripeWebhook(
        Buffer.from('stripe-payload'),
        'stripe-signature',
      ),
    ).resolves.toEqual({ received: true });

    expect(transactionClient.payment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'payment-id',
        status: PaymentStatus.PENDING,
      },
      data: { status: PaymentStatus.FAILED },
    });
    expect(transactionClient.order.updateMany).not.toHaveBeenCalled();
    expect(ordersQueue.add).not.toHaveBeenCalled();
  });

  it('re-enqueues an idempotent job for a replayed Stripe success webhook', async () => {
    stripeService.constructWebhookEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_duplicate' } },
    });
    prismaService.payment.findUnique.mockResolvedValue({
      id: 'payment-id',
      status: PaymentStatus.SUCCEEDED,
      orderId: 'order-id',
    });
    transactionClient.payment.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      paymentsService.handleStripeWebhook(
        Buffer.from('stripe-payload'),
        'stripe-signature',
      ),
    ).resolves.toEqual({ received: true });

    expect(transactionClient.order.updateMany).not.toHaveBeenCalled();
    expect(ordersQueue.add).toHaveBeenCalledWith(
      ORDER_PAID_JOB,
      {
        orderId: 'order-id',
        paymentId: 'payment-id',
      },
      {
        jobId: 'order-paid-payment-id',
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    );
  });
});
