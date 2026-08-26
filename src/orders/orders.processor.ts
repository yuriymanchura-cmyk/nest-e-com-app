import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ORDER_PAID_JOB, type OrderPaidJobData } from './jobs/order-paid.job';

@Processor('orders')
export class OrdersProcessor extends WorkerHost {
  private readonly logger = new Logger(OrdersProcessor.name);

  process(job: Job<OrderPaidJobData>): Promise<void> {
    if (job.name !== ORDER_PAID_JOB) {
      throw new Error(`Unsupported order job: ${job.name}`);
    }

    this.logger.log(
      `Processing paid order ${job.data.orderId}, payment ${job.data.paymentId}`,
    );

    return Promise.resolve();
  }
}
