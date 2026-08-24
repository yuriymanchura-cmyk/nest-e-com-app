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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiServiceUnavailableResponse,
  ApiHeader,
  ApiOkResponse,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from '../auth/jwt-auth/jwt-auth.guard';
import { MockPaymentWebhookDto } from './dto/mock-payment-webhook.dto';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('orders/:orderId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create or retry a mock payment for the current user order',
  })
  @ApiParam({
    name: 'orderId',
    description: 'Order UUID',
    format: 'uuid',
    example: '9d1e2bef-d80b-4a14-bf77-f202f35f4c8c',
  })
  @ApiCreatedResponse({
    description: 'Mock payment created or returned successfully',
  })
  @ApiBadRequestResponse({
    description: 'Order or payment is not available for payment processing',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiNotFoundResponse({
    description: 'Order not found or does not belong to current user',
  })
  createForOrder(
    @Req() request: AuthenticatedRequest,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentService.createForOrder(request.user!.sub, orderId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('orders/:orderId/stripe-intent')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a Stripe PaymentIntent for the current user order',
  })
  @ApiParam({
    name: 'orderId',
    description: 'Order UUID',
    format: 'uuid',
    example: '9d1e2bef-d80b-4a14-bf77-f202f35f4c8c',
  })
  @ApiCreatedResponse({
    description: 'Stripe PaymentIntent created and client secret returned',
  })
  @ApiBadRequestResponse({
    description: 'Order or payment is not available for Stripe processing',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiNotFoundResponse({
    description: 'Order not found or does not belong to current user',
  })
  @ApiServiceUnavailableResponse({
    description: 'Stripe did not return a client secret',
  })
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
  @ApiOperation({
    summary: 'Process a Stripe payment webhook',
  })
  @ApiHeader({
    name: 'stripe-signature',
    required: true,
    description:
      'Stripe-generated signature used to verify the webhook payload',
  })
  @ApiOkResponse({
    description:
      'Webhook received and processed, or safely ignored when irrelevant',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid Stripe webhook signature',
  })
  @ApiBadRequestResponse({
    description: 'Related order is not available for processing',
  })
  handleStripeWebhook(
    @Headers('stripe-signature') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
  ) {
    return this.paymentService.handleStripeWebhook(request.rawBody, signature);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post(':paymentId/confirm')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm a pending mock payment for the current user',
  })
  @ApiParam({
    name: 'paymentId',
    description: 'Mock payment UUID',
    format: 'uuid',
    example: 'f51183ec-7c26-4923-8ea4-a8f1ae00a5cc',
  })
  @ApiOkResponse({
    description:
      'Mock payment confirmed successfully and the related order moves to processing',
  })
  @ApiBadRequestResponse({
    description: 'Payment or order is not available for confirmation',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiNotFoundResponse({
    description: 'Mock payment not found or does not belong to current user',
  })
  confirmPayment(
    @Req() request: AuthenticatedRequest,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentService.confirmPayment(request.user!.sub, paymentId);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post(':paymentId/fail')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mark a pending mock payment as failed for the current user',
  })
  @ApiParam({
    name: 'paymentId',
    description: 'Mock payment UUID',
    format: 'uuid',
    example: 'f51183ec-7c26-4923-8ea4-a8f1ae00a5cc',
  })
  @ApiOkResponse({
    description: 'Mock payment marked as failed successfully',
  })
  @ApiBadRequestResponse({
    description: 'Payment or order is not available for failure',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiNotFoundResponse({
    description: 'Mock payment not found or does not belong to current user',
  })
  failPayment(
    @Req() request: AuthenticatedRequest,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentService.failPayment(request.user!.sub, paymentId);
  }

  @SkipThrottle()
  @Post('webhooks/mock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Process a mock payment provider webhook',
  })
  @ApiHeader({
    name: 'x-mock-webhook-secret',
    required: true,
    description: 'Shared secret used to authenticate the mock payment provider',
  })
  @ApiOkResponse({
    description:
      'Mock payment webhook processed successfully or repeated safely',
  })
  @ApiBadRequestResponse({
    description:
      'Webhook status must be SUCCEEDED or FAILED, or payment/order cannot be updated',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid mock webhook secret',
  })
  @ApiNotFoundResponse({
    description: 'Mock payment not found',
  })
  handleMockWebhook(
    @Headers('x-mock-webhook-secret') webhookSecret: string | undefined,
    @Body() dto: MockPaymentWebhookDto,
  ) {
    return this.paymentService.handleMockWebhook(webhookSecret, dto);
  }
}
