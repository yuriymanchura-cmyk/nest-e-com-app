import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Prisma } from '../generated/prisma/client';

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    return HTML_ENTITIES[character] ?? character;
  });
}

type OrderPaidConfirmationInput = {
  to: string;
  orderId: string;
  totalAmount: Prisma.Decimal;
  items: Array<{
    productName: string;
    quantity: number;
    lineTotal: Prisma.Decimal;
  }>;
};

@Injectable()
export class NotificationsService {
  private readonly resend: Resend;

  constructor(private readonly configService: ConfigService) {
    this.resend = new Resend(
      this.configService.getOrThrow<string>('RESEND_API_KEY'),
    );
  }

  async sendOrderPaidConfirmation(
    input: OrderPaidConfirmationInput,
  ): Promise<void> {
    const displayOrderReference = input.orderId.slice(0, 8).toUpperCase();
    const formattedTotal = input.totalAmount.toString();
    const itemsText = input.items
      .map(
        (item) =>
          `- ${item.productName} x ${item.quantity}: $${item.lineTotal.toString()}`,
      )
      .join('\n');
    const itemsHtml = input.items
      .map(
        (item) => `
          <tr>
            <td style="padding: 14px 0; border-bottom: 1px solid #e5e7eb; color: #111827;">
              ${escapeHtml(item.productName)}
            </td>
            <td align="center" style="padding: 14px 12px; border-bottom: 1px solid #e5e7eb; color: #4b5563;">
              x${item.quantity}
            </td>
            <td align="right" style="padding: 14px 0; border-bottom: 1px solid #e5e7eb; color: #111827; font-weight: 600;">
              $${item.lineTotal.toString()}
            </td>
          </tr>`,
      )
      .join('');
    const { error } = await this.resend.emails.send({
      from: this.configService.getOrThrow<string>('EMAIL_FROM'),
      to: [input.to],
      subject: `Payment confirmed - order #${displayOrderReference}`,
      text: [
        'Payment confirmed',
        `Order #${displayOrderReference}`,
        '',
        'Your payment was received successfully.',
        '',
        'Items:',
        itemsText,
        '',
        `Total: $${formattedTotal}`,
      ].join('\n'),
      html: `
        <!doctype html>
        <html lang="en">
          <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: Arial, sans-serif; color: #111827;">
            <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
              Your payment for order #${displayOrderReference} was received successfully.
            </div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f3f4f6; padding: 32px 16px;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden;">
                    <tr>
                      <td style="padding: 32px; background-color: #111827; color: #ffffff;">
                        <p style="margin: 0 0 8px; font-size: 14px; color: #a7f3d0; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;">Payment received</p>
                        <h1 style="margin: 0; font-size: 28px; line-height: 1.2;">Thank you for your order</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 32px;">
                        <p style="margin: 0 0 8px; font-size: 16px; line-height: 1.5;">Your payment was received successfully.</p>
                        <p style="margin: 0 0 28px; color: #6b7280; font-size: 14px;">Order reference: <strong style="color: #111827;">#${displayOrderReference}</strong></p>
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                          <tr>
                            <th align="left" style="padding: 0 0 10px; border-bottom: 2px solid #111827; font-size: 12px; text-transform: uppercase; color: #6b7280;">Item</th>
                            <th align="center" style="padding: 0 12px 10px; border-bottom: 2px solid #111827; font-size: 12px; text-transform: uppercase; color: #6b7280;">Qty</th>
                            <th align="right" style="padding: 0 0 10px; border-bottom: 2px solid #111827; font-size: 12px; text-transform: uppercase; color: #6b7280;">Amount</th>
                          </tr>
                          ${itemsHtml}
                        </table>
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 24px;">
                          <tr>
                            <td style="font-size: 18px; font-weight: 700;">Total paid</td>
                            <td align="right" style="font-size: 22px; font-weight: 700; color: #047857;">$${formattedTotal}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 20px 32px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 13px; line-height: 1.5;">
                        Keep this email as your payment confirmation. If you need help, reply to this email.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    if (error) {
      throw new Error(`Failed to send order confirmation: ${error.message}`);
    }
  }
}
