import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { NotificationsService } from './notifications.service';

type EmailPayload = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
};

const mockSend = jest.fn<Promise<unknown>, [EmailPayload]>();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockSend,
    },
  })),
}));

describe('NotificationsService', () => {
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        RESEND_API_KEY: 're_test_key',
        EMAIL_FROM: 'orders@example.com',
      };

      return values[key];
    }),
  } as unknown as ConfigService;

  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null });
    service = new NotificationsService(configService);
  });

  it('sends a readable HTML payment confirmation without exposing the full order id', async () => {
    await service.sendOrderPaidConfirmation({
      to: 'customer@example.com',
      orderId: 'b9923f80-00f9-410a-abb0-9ff5fa977936',
      totalAmount: new Prisma.Decimal('3049.95'),
      items: [
        {
          productName: 'PlayStation <Slim> & Friends',
          quantity: 5,
          lineTotal: new Prisma.Decimal('3049.95'),
        },
      ],
    });

    const payload = mockSend.mock.calls[0]?.[0];

    if (!payload) {
      throw new Error('Expected Resend to receive an email payload');
    }

    expect(payload.from).toBe('orders@example.com');
    expect(payload.to).toEqual(['customer@example.com']);
    expect(payload.subject).toBe('Payment confirmed - order #B9923F80');
    expect(payload.text).toContain('Order #B9923F80');
    expect(payload.html).toContain('PlayStation &lt;Slim&gt; &amp; Friends');
  });

  it('throws when Resend returns an error', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Provider unavailable' },
    });

    await expect(
      service.sendOrderPaidConfirmation({
        to: 'customer@example.com',
        orderId: 'b9923f80-00f9-410a-abb0-9ff5fa977936',
        totalAmount: new Prisma.Decimal('10.00'),
        items: [],
      }),
    ).rejects.toThrow(
      'Failed to send order confirmation: Provider unavailable',
    );
  });
});
