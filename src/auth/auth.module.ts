import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth/jwt-auth.guard';
import { RolesGuard } from './roles/roles.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<StringValue>(
            'JWT_ACCESS_TOKEN_TTL',
          ),
        },
      }),
    }),
  ],
  providers: [AuthService, AuthRepository, JwtAuthGuard, RolesGuard],
  controllers: [AuthController],
  exports: [JwtModule, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
