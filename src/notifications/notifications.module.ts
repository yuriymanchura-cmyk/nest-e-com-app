import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OrderNotificationsRepository } from './order-notifications.repository';

@Module({
  imports: [PrismaModule],
  providers: [NotificationsService, OrderNotificationsRepository],
  exports: [NotificationsService, OrderNotificationsRepository],
})
export class NotificationsModule {}
