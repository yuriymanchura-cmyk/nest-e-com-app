import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartRepository } from './cart.repository';

@Injectable()
export class CartService {
  constructor(private readonly cartRepository: CartRepository) {}

  async getCart(userId: string) {
    const cart = await this.cartRepository.findCartByUserId(userId);
    return cart ?? { id: null, items: [] };
  }

  async addItem(userId: string, dto: AddCartItemDto) {
    const product = await this.cartRepository.findProductForCart(dto.productId);

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!product.isActive) {
      throw new BadRequestException('Product is not available');
    }

    if (dto.quantity > product.stock) {
      throw new BadRequestException(
        'Requested quantity exceeds available stock',
      );
    }

    const cart = await this.cartRepository.getOrCreateCart(userId);

    const existingItem = await this.cartRepository.findItemQuantity(
      cart.id,
      product.id,
    );

    const totalQuantity = (existingItem?.quantity ?? 0) + dto.quantity;

    if (totalQuantity > product.stock) {
      throw new BadRequestException(
        'Requested quantity exceeds available stock',
      );
    }

    await this.cartRepository.addOrIncrementItem(
      cart.id,
      product.id,
      dto.quantity,
    );

    return this.getCart(userId);
  }

  async updateItem(userId: string, itemId: string, dto: UpdateCartItemDto) {
    const item = await this.cartRepository.findItemWithOwnerAndProduct(itemId);

    if (!item || item.cart.userId !== userId) {
      throw new NotFoundException('Cart item not found');
    }

    if (!item.product.isActive) {
      throw new BadRequestException('Product is not available');
    }

    if (dto.quantity > item.product.stock) {
      throw new BadRequestException(
        'Requested quantity exceeds available stock',
      );
    }
    await this.cartRepository.updateItemQuantity(itemId, dto.quantity);

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const item = await this.cartRepository.findItemWithOwner(itemId);

    if (!item || item.cart.userId !== userId) {
      throw new NotFoundException('Cart item not found');
    }

    await this.cartRepository.deleteItem(itemId);

    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    await this.cartRepository.clearCart(userId);

    return this.getCart(userId);
  }
}
