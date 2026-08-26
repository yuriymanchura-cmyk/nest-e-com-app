import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ORDER_PAID_JOB, type OrderPaidJobData } from './jobs/order-paid.job';
import { OrdersProcessor } from './orders.processor';

describe('OrdersProcessor', () => {
  let processor: OrdersProcessor;
  let loggerLog: jest.SpyInstance;

  beforeEach(() => {
    processor = new OrdersProcessor();
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

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(loggerLog).toHaveBeenCalledWith(
      'Processing paid order order-id, payment payment-id',
    );
  });

  it('rejects an unsupported job name', () => {
    const job = {
      name: 'unsupported-job',
      data: {
        orderId: 'order-id',
        paymentId: 'payment-id',
      },
    } as Job<OrderPaidJobData>;

    expect(() => processor.process(job)).toThrow(
      'Unsupported order job: unsupported-job',
    );
  });
});
