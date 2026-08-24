import { IsEnum, IsUUID } from 'class-validator';
import { PaymentStatus } from '../../generated/prisma/enums';
import { ApiProperty } from '@nestjs/swagger';

export class MockPaymentWebhookDto {
  @IsUUID()
  @ApiProperty({
    description: 'Mock payment UUID',
    format: 'uuid',
    example: 'f51183ec-7c26-4923-8ea4-a8f1ae00a5cc',
  })
  paymentId!: string;

  @IsEnum(PaymentStatus)
  @ApiProperty({
    enum: [PaymentStatus.SUCCEEDED, PaymentStatus.FAILED],
    example: PaymentStatus.SUCCEEDED,
    description: 'Final payment provider result',
  })
  status!: PaymentStatus;
}
