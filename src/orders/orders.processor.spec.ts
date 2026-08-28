import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ORDER_PAID_JOB, type OrderPaidJobData } from './jobs/order-paid.job';
import { OrdersProcessor } from './orders.processor';
import { NotificationStatus } from '../generated/prisma/enums';
import { NotificationsService } from '../notifications/notifications.service';

describe('OrdersProcessor', () => {
  let processor: OrdersProcessor;
  let loggerLog: jest.SpyInstance;
  let loggerError: jest.SpyInstance;

  const notificationsRepository = {
    findProcessingOrder: jest.fn(),
    createOrFindPaidConfirmation: jest.fn(),
    markSent: jest.fn(),
    markFailed: jest.fn(),
  };

  const notificationsService = {
    sendOrderPaidConfirmation: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();

    processor = new OrdersProcessor(
      notificationsRepository as never,
      notificationsService as unknown as NotificationsService,
    );
    loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('processes a paid order job', async () => {
    const sentAt = new Date('2026-08-26T18:00:00.000Z');
    jest.useFakeTimers().setSystemTime(sentAt);

    const job = {
      name: ORDER_PAID_JOB,
      data: {
        orderId: 'order-id',
        paymentId: 'payment-id',
      },
    } as Job<OrderPaidJobData>;

    notificationsRepository.findProcessingOrder.mockResolvedValue({
      subtotal: '609.99',
      totalAmount: '609.99',
      user: { email: 'customer@example.com' },
      items: [
        {
          productName: 'PlayStation 5 Slim',
          quantity: 1,
          lineTotal: '609.99',
        },
      ],
    });
    notificationsRepository.createOrFindPaidConfirmation.mockResolvedValue({
      id: 'notification-id',
      status: NotificationStatus.PENDING,
    });

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(notificationsRepository.findProcessingOrder).toHaveBeenCalledWith(
      'order-id',
    );
    expect(
      notificationsRepository.createOrFindPaidConfirmation,
    ).toHaveBeenCalledWith('order-id');

    expect(notificationsService.sendOrderPaidConfirmation).toHaveBeenCalledWith(
      {
        to: 'customer@example.com',
        orderId: 'order-id',
        totalAmount: '609.99',
        items: [
          {
            productName: 'PlayStation 5 Slim',
            quantity: 1,
            lineTotal: '609.99',
          },
        ],
      },
    );
    expect(notificationsRepository.markSent).toHaveBeenCalledWith(
      'notification-id',
    );

    expect(loggerLog).toHaveBeenCalledWith(
      'Sent paid-order confirmation for order-id to customer@example.com',
    );
  });

  it('skips a paid order confirmation that was already sent', async () => {
    const job = {
      name: ORDER_PAID_JOB,
      data: {
        orderId: 'order-id',
        paymentId: 'payment-id',
      },
    } as Job<OrderPaidJobData>;

    notificationsRepository.findProcessingOrder.mockResolvedValue({
      user: { email: 'customer@example.com' },
      items: [],
    });
    notificationsRepository.createOrFindPaidConfirmation.mockResolvedValue({
      id: 'notification-id',
      status: NotificationStatus.SENT,
    });

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(
      notificationsService.sendOrderPaidConfirmation,
    ).not.toHaveBeenCalled();
    expect(notificationsRepository.markSent).not.toHaveBeenCalled();
    expect(loggerLog).not.toHaveBeenCalled();
    expect(loggerError).not.toHaveBeenCalled();
  });

  it('marks the notification as failed after the last delivery attempt', async () => {
    const job = {
      name: ORDER_PAID_JOB,
      data: {
        orderId: 'order-id',
        paymentId: 'payment-id',
      },
      opts: { attempts: 3 },
      attemptsMade: 2,
    } as Job<OrderPaidJobData>;

    notificationsRepository.findProcessingOrder.mockResolvedValue({
      totalAmount: '609.99',
      user: { email: 'customer@example.com' },
      items: [],
    });
    notificationsRepository.createOrFindPaidConfirmation.mockResolvedValue({
      id: 'notification-id',
      status: NotificationStatus.PENDING,
    });
    notificationsService.sendOrderPaidConfirmation.mockRejectedValue(
      new Error('Failed to send order confirmation'),
    );

    await expect(processor.process(job)).rejects.toThrow(
      'Failed to send order confirmation',
    );

    expect(notificationsRepository.markFailed).toHaveBeenCalledWith(
      'notification-id',
    );
    expect(loggerError).toHaveBeenCalledWith(
      'Failed to send paid-order confirmation for order-id',
      expect.stringContaining('Failed to send order confirmation'),
    );
  });

  it('leaves the notification pending when email delivery fails', async () => {
    const job = {
      name: ORDER_PAID_JOB,
      data: {
        orderId: 'order-id',
        paymentId: 'payment-id',
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as Job<OrderPaidJobData>;

    notificationsRepository.findProcessingOrder.mockResolvedValue({
      user: { email: 'customer@example.com' },
      items: [],
    });
    notificationsRepository.createOrFindPaidConfirmation.mockResolvedValue({
      id: 'notification-id',
      status: NotificationStatus.PENDING,
    });
    notificationsService.sendOrderPaidConfirmation.mockRejectedValue(
      new Error('Failed to send order confirmation'),
    );

    await expect(processor.process(job)).rejects.toThrow(
      'Failed to send order confirmation',
    );

    expect(notificationsRepository.markFailed).not.toHaveBeenCalled();
    expect(loggerLog).not.toHaveBeenCalled();
  });

  it('fails when the paid order is no longer available for confirmation', async () => {
    const job = {
      name: ORDER_PAID_JOB,
      data: {
        orderId: 'order-id',
        paymentId: 'payment-id',
      },
    } as Job<OrderPaidJobData>;

    notificationsRepository.findProcessingOrder.mockResolvedValue(null);

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
