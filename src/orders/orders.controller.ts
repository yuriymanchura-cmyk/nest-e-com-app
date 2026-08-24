import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from '../auth/jwt-auth/jwt-auth.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { RolesGuard } from '../auth/roles/roles.guard';
import { Role } from '../generated/prisma/enums';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orderService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an order from the current user cart' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Unique UUID for one checkout attempt; reuse it only when retrying the same request',
    schema: {
      type: 'string',
      format: 'uuid',
      example: '32328333-a635-4e85-9ff6-c8e94fc05efa',
    },
  })
  @ApiCreatedResponse({
    description:
      'Order created successfully, or the existing order returned for the same idempotency key',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid idempotency key, empty cart, unavailable product, or insufficient stock',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  checkout(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.orderService.checkout(request.user!.sub, idempotencyKey);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel a pending order and restore product stock',
  })
  @ApiParam({
    name: 'id',
    description: 'Order UUID',
    format: 'uuid',
    example: '9d1e2bef-d80b-4a14-bf77-f202f35f4c8c',
  })
  @ApiOkResponse({
    description: 'Order canceled successfully and stock restored',
  })
  @ApiBadRequestResponse({
    description: 'Order cannot be canceled after processing has started',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiNotFoundResponse({
    description: 'Order not found or does not belong to current user',
  })
  cancel(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.orderService.cancel(request.user!.sub, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List all orders for administrators',
  })
  @ApiOkResponse({
    description: 'All orders returned successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiForbiddenResponse({
    description: 'Admin role is required',
  })
  findAllForAdmin() {
    return this.orderService.findAllForAdmin();
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List orders of the current user',
  })
  @ApiOkResponse({
    description: 'Current user order history returned successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  findMyOrders(@Req() request: AuthenticatedRequest) {
    return this.orderService.findMyOrders(request.user!.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get one order of the current user',
  })
  @ApiParam({
    name: 'id',
    description: 'Order UUID',
    format: 'uuid',
    example: '9d1e2bef-d80b-4a14-bf77-f202f35f4c8c',
  })
  @ApiOkResponse({
    description: 'Order details returned successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiNotFoundResponse({
    description: 'Order not found or does not belong to current user',
  })
  findMyOrder(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.orderService.findMyOrder(request.user!.sub, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/status')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update an order status (admin only)',
  })
  @ApiParam({
    name: 'id',
    description: 'Order UUID',
    format: 'uuid',
    example: '9d1e2bef-d80b-4a14-bf77-f202f35f4c8c',
  })
  @ApiOkResponse({
    description: 'Order status updated successfully',
  })
  @ApiBadRequestResponse({
    description: 'Invalid payload or invalid order status transition',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiForbiddenResponse({
    description: 'Admin role is required',
  })
  @ApiNotFoundResponse({
    description: 'Order not found',
  })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orderService.updateStatus(id, dto);
  }
}
