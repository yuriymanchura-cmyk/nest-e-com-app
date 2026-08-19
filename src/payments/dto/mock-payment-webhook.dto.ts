import { IsEnum, IsUUID } from 'class-validator';
import { PaymentStatus } from '../../generated/prisma/enums';

export class MockPaymentWebhookDto {
  @IsUUID()
  paymentId!: string;

  @IsEnum(PaymentStatus)
  status!: PaymentStatus;
}
