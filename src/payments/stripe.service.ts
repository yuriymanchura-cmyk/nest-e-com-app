import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;

  constructor(private readonly configService: ConfigService) {
    this.stripe = new Stripe(
      configService.getOrThrow<string>('STRIPE_SECRET_KEY'),
    );
  }

  async createPaymentIntent(
    paymentId: string,
    orderId: string,
    amount: string,
  ): Promise<Stripe.PaymentIntent> {
    const amountInCents = this.toCents(amount);

    return this.stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        metadata: {
          paymentId,
          orderId,
        },
      },
      {
        idempotencyKey: `payment-intent:${paymentId}`,
      },
    );
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.configService.getOrThrow<string>('STRIPE_WEBHOOK_SECRET'),
    );
  }

  private toCents(amount: string): number {
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      throw new Error('Invalid payment amount');
    }

    const [whole, fraction = ''] = amount.split('.');
    const cents = Number(`${whole}${fraction.padEnd(2, '0')}`);

    if (!Number.isSafeInteger(cents) || cents < 50 || cents > 99_999_999) {
      throw new Error('Payment amount is outside Stripe limits');
    }

    return cents;
  }
}
