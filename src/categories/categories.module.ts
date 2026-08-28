import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CategoriesRepository } from './categories.repository';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [CategoriesService, CategoriesRepository],
  controllers: [CategoriesController],
})
export class CategoriesModule {}
