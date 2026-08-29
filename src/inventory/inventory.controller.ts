import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
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
import { RestockProductDto } from './dto/restock-product.dto';
import { InventoryService } from './inventory.service';

@ApiTags('Inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('products/:productId/restock')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Restock a product and record an audit movement' })
  @ApiParam({
    name: 'productId',
    format: 'uuid',
    example: 'd52aff96-4dbf-4d8c-8cdb-876a6786aa46',
  })
  @ApiCreatedResponse({ description: 'Product stock restocked successfully' })
  @ApiBadRequestResponse({ description: 'Quantity must be a positive integer' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Admin role is required' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  restock(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: RestockProductDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.inventoryService.restock(productId, request.user!.sub, dto);
  }
}
