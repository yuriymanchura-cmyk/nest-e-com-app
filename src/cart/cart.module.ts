import { Module } from '@nestjs/common';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CartRepository } from './cart.repository';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [CartService, CartRepository],
  controllers: [CartController],
})
export class CartModule {}
