import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ORDER_PAID_JOB, type OrderPaidJobData } from './jobs/order-paid.job';
import { OrdersProcessor } from './orders.processor';
import { PrismaService } from '../prisma/prisma.service';

describe('OrdersProcessor', () => {
  let processor: OrdersProcessor;
  let loggerLog: jest.SpyInstance;

  const prismaService = {
    order: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();

    processor = new OrdersProcessor(prismaService as unknown as PrismaService);
    loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('processes a paid order job', async () => {
    const job = {
      name: ORDER_PAID_JOB,
      data: {
        orderId: 'order-id',
        paymentId: 'payment-id',
      },
    } as Job<OrderPaidJobData>;

    prismaService.order.findUnique.mockResolvedValue({
      user: { email: 'customer@example.com' },
      items: [
        {
          productName: 'PlayStation 5 Slim',
          quantity: 1,
          lineTotal: '609.99',
        },
      ],
    });

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(prismaService.order.findUnique).toHaveBeenCalledWith({
      where: {
        id: 'order-id',
        status: 'PROCESSING',
      },
      select: {
        user: {
          select: {
            email: true,
          },
        },
        items: {
          select: {
            productName: true,
            quantity: true,
            lineTotal: true,
          },
        },
      },
    });

    expect(loggerLog).toHaveBeenCalledWith(
      'Prepared confirmation for paid order order-id with 1 item(s)',
    );
  });

  it('fails when the paid order is no longer available for confirmation', async () => {
    const job = {
      name: ORDER_PAID_JOB,
      data: {
        orderId: 'order-id',
        paymentId: 'payment-id',
      },
    } as Job<OrderPaidJobData>;

    prismaService.order.findUnique.mockResolvedValue(null);

    await expect(processor.process(job)).rejects.toThrow(
      'Order order-id is not available for confirmation',
    );
  });

  it('rejects an unsupported job name', async () => {
    const job = {
      name: 'unsupported-job',
      data: {
        orderId: 'order-id',
        paymentId: 'payment-id',
      },
    } as Job<OrderPaidJobData>;

    await expect(processor.process(job)).rejects.toThrow(
      'Unsupported order job: unsupported-job',
    );
  });
});
