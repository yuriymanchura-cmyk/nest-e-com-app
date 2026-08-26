import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ORDER_PAID_JOB, type OrderPaidJobData } from './jobs/order-paid.job';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '../generated/prisma/enums';

@Processor('orders')
export class OrdersProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaService) {
    super();
  }
  private readonly logger = new Logger(OrdersProcessor.name);

  async process(job: Job<OrderPaidJobData>): Promise<void> {
    if (job.name !== ORDER_PAID_JOB) {
      throw new Error(`Unsupported order job: ${job.name}`);
    }

    const order = await this.prisma.order.findUnique({
      where: {
        id: job.data.orderId,
        status: OrderStatus.PROCESSING,
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

    if (!order) {
      throw new Error(
        `Order ${job.data.orderId} is not available for confirmation`,
      );
    }

    this.logger.log(
      `Prepared confirmation for paid order ${job.data.orderId} with ${order.items.length} item(s)`,
    );
  }
}
