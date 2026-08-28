import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ORDER_PAID_JOB, type OrderPaidJobData } from './jobs/order-paid.job';
import { NotificationStatus } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderNotificationsRepository } from '../notifications/order-notifications.repository';

@Processor('orders')
export class OrdersProcessor extends WorkerHost {
  constructor(
    private readonly notificationsRepository: OrderNotificationsRepository,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  private readonly logger = new Logger(OrdersProcessor.name);

  async process(job: Job<OrderPaidJobData>): Promise<void> {
    if (job.name !== ORDER_PAID_JOB) {
      throw new Error(`Unsupported order job: ${job.name}`);
    }

    const order = await this.notificationsRepository.findProcessingOrder(
      job.data.orderId,
    );

    if (!order) {
      throw new Error(
        `Order ${job.data.orderId} is not available for confirmation`,
      );
    }

    const notification =
      await this.notificationsRepository.createOrFindPaidConfirmation(
        job.data.orderId,
      );

    if (notification.status === NotificationStatus.SENT) {
      return;
    }

    try {
      await this.notificationsService.sendOrderPaidConfirmation({
        to: order.user.email,
        orderId: job.data.orderId,
        totalAmount: order.totalAmount,
        items: order.items,
      });
    } catch (error: unknown) {
      const totalAttempts = job.opts?.attempts ?? 1;
      const attemptsMade = job.attemptsMade ?? 0;
      const isLastAttempt = attemptsMade + 1 >= totalAttempts;

      if (isLastAttempt) {
        await this.notificationsRepository.markFailed(notification.id);

        this.logger.error(
          `Failed to send paid-order confirmation for ${job.data.orderId}`,
          error instanceof Error ? error.stack : undefined,
        );
      }

      throw error;
    }
    await this.notificationsRepository.markSent(notification.id);

    this.logger.log(
      `Sent paid-order confirmation for ${job.data.orderId} to ${order.user.email}`,
    );
  }
}
