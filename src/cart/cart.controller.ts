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
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth/jwt-auth.guard';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  getCart(@Req() request: AuthenticatedRequest) {
    return this.cartService.getCart(request.user!.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('items')
  addItem(@Req() request: AuthenticatedRequest, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(request.user!.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('items/:itemId')
  updateItem(
    @Req() request: AuthenticatedRequest,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(request.user!.sub, itemId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('items/:itemId')
  removeItem(
    @Req() request: AuthenticatedRequest,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ) {
    return this.cartService.removeItem(request.user!.sub, itemId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete()
  clearCart(@Req() request: AuthenticatedRequest) {
    return this.cartService.clearCart(request.user!.sub);
  }
}
