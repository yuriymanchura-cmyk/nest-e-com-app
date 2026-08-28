import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BullModule.registerQueue({ name: 'orders' }),
  ],
  providers: [PaymentsService, PaymentsRepository, StripeService],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
