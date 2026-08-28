import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { BullModule } from '@nestjs/bullmq';
import { OrdersProcessor } from './orders.processor';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersRepository } from './orders.repository';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    NotificationsModule,
    BullModule.registerQueue({ name: 'orders' }),
  ],
  providers: [OrdersService, OrdersProcessor, OrdersRepository],
  controllers: [OrdersController],
})
export class OrdersModule {}
