import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';

import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth/jwt-auth.guard';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@ApiTags('Cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current user cart' })
  @ApiOkResponse({ description: 'Current cart with its items' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  getCart(@Req() request: AuthenticatedRequest) {
    return this.cartService.getCart(request.user!.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('items')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a product to the current user cart' })
  @ApiCreatedResponse({
    description: 'Cart item added or its quantity updated',
  })
  @ApiBadRequestResponse({
    description: 'Invalid quantity, inactive product, or insufficient stock',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  addItem(@Req() request: AuthenticatedRequest, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(request.user!.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('items/:itemId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update quantity of a cart item' })
  @ApiParam({
    name: 'itemId',
    format: 'uuid',
    example: 'c944a580-e7a2-47e4-a66a-30ecd7fc3a65',
  })
  @ApiOkResponse({ description: 'Cart item quantity updated successfully' })
  @ApiBadRequestResponse({
    description: 'Invalid quantity, inactive product, or insufficient stock',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiNotFoundResponse({
    description: 'Cart item not found or does not belong to the current user',
  })
  updateItem(
    @Req() request: AuthenticatedRequest,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(request.user!.sub, itemId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('items/:itemId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove an item from the current user cart' })
  @ApiParam({
    name: 'itemId',
    format: 'uuid',
    example: 'c944a580-e7a2-47e4-a66a-30ecd7fc3a65',
  })
  @ApiOkResponse({ description: 'Cart item removed successfully' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiNotFoundResponse({
    description: 'Cart item not found or does not belong to the current user',
  })
  removeItem(
    @Req() request: AuthenticatedRequest,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ) {
    return this.cartService.removeItem(request.user!.sub, itemId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Clear all items from the current user cart' })
  @ApiOkResponse({ description: 'Cart cleared successfully' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  clearCart(@Req() request: AuthenticatedRequest) {
    return this.cartService.clearCart(request.user!.sub);
  }
}
