import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { BullModule } from '@nestjs/bullmq';
import { OrdersProcessor } from './orders.processor';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BullModule.registerQueue({ name: 'orders' }),
  ],
  providers: [OrdersService, OrdersProcessor],
  controllers: [OrdersController],
})
export class OrdersModule {}
