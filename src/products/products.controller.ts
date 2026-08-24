import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Roles } from '../auth/roles/roles.decorator';
import { RolesGuard } from '../auth/roles/roles.guard';
import { Role } from '../generated/prisma/enums';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto, ProductSort } from './dto/product-query.dto';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a product (admin only)' })
  @ApiCreatedResponse({ description: 'Product created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid product payload or price' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Admin role is required' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiConflictResponse({ description: 'Product slug already exists' })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List active products with filters and pagination' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    default: 1,
    minimum: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    default: 50,
    minimum: 1,
    maximum: 50,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    example: 'playstation',
    description: 'Searches product name and description',
  })
  @ApiQuery({
    name: 'categorySlug',
    required: false,
    type: String,
    example: 'gaming-consoles',
    description: 'Filter by category slug',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ProductSort,
    example: ProductSort.NEWEST,
    default: ProductSort.NEWEST,
  })
  @ApiOkResponse({ description: 'Paginated public product catalog' })
  findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get an active product by slug' })
  @ApiParam({
    name: 'slug',
    example: 'playstation-5-slim',
  })
  @ApiOkResponse({ description: 'Public product details' })
  @ApiNotFoundResponse({ description: 'Product not found or inactive' })
  findOneBySlug(@Param('slug') slug: string) {
    return this.productsService.findOneBySlug(slug);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a product (admin only)' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: 'd52aff96-4dbf-4d8c-8cdb-876a6786aa46',
  })
  @ApiOkResponse({ description: 'Product updated successfully' })
  @ApiBadRequestResponse({
    description: 'Invalid product payload, price, or empty update payload',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Admin role is required' })
  @ApiNotFoundResponse({ description: 'Product or category not found' })
  @ApiConflictResponse({ description: 'Product slug already exists' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, dto);
  }
}
