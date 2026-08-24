import type { Request } from 'express';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  type RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from '../auth/jwt-auth/jwt-auth.guard';
import { MockPaymentWebhookDto } from './dto/mock-payment-webhook.dto';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('orders/:orderId')
  createForOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentService.createForOrder(request.user!.sub, orderId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('orders/:orderId/stripe-intent')
  createStripePaymentIntent(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentService.createStripePaymentIntent(
      request.user!.sub,
      orderId,
    );
  }

  @SkipThrottle()
  @Post('webhooks/stripe')
  @HttpCode(HttpStatus.OK)
  handleStripeWebhook(
    @Headers('stripe-signature') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
  ) {
    return this.paymentService.handleStripeWebhook(request.rawBody, signature);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post(':paymentId/confirm')
  confirmPayment(
    @Req() request: AuthenticatedRequest,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentService.confirmPayment(request.user!.sub, paymentId);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post(':paymentId/fail')
  failPayment(
    @Req() request: AuthenticatedRequest,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentService.failPayment(request.user!.sub, paymentId);
  }

  @SkipThrottle()
  @Post('webhooks/mock')
  @HttpCode(HttpStatus.OK)
  handleMockWebhook(
    @Headers('x-mock-webhook-secret') webhookSecret: string | undefined,
    @Body() dto: MockPaymentWebhookDto,
  ) {
    return this.paymentService.handleMockWebhook(webhookSecret, dto);
  }
}
