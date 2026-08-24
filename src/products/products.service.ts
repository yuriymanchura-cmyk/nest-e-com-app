import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { RedisService } from '../redis/redis.service';
import { ProductQueryDto, ProductSort } from './dto/product-query.dto';

type PublicProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: string;
  category: {
    id: string;
    name: string;
    slug: string;
  };
};

type PaginatedProducts = {
  data: PublicProduct[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const ACTIVE_PRODUCTS_CACHE_TTL_SECONDS = 60;
const ACTIVE_PRODUCTS_CATALOG_CACHE_PATTERN = 'products:active:catalog:*';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async create(dto: CreateProductDto) {
    const price = new Prisma.Decimal(dto.price);

    if (price.lessThanOrEqualTo(0) || price.greaterThan('99999999.99')) {
      throw new BadRequestException(
        'Price must be between 0.01 and 99999999.99',
      );
    }

    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    try {
      const product = await this.prisma.product.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          description: dto.description,
          price,
          stock: dto.stock,
          categoryId: category.id,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          price: true,
          stock: true,
          isActive: true,
          categoryId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await this.redis.deleteByPattern(ACTIVE_PRODUCTS_CATALOG_CACHE_PATTERN);

      return product;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Product slug already exists');
      }

      throw error;
    }
  }

  async findAll(query: ProductQueryDto): Promise<PaginatedProducts> {
    const {
      categorySlug,
      search,
      limit = 50,
      page = 1,
      sort = ProductSort.NEWEST,
    } = query;

    const cacheKey = this.getActiveProductsCatalogCacheKey({
      ...query,
      page,
      limit,
      sort,
    });
    const cachedProducts = await this.redis.get(cacheKey);

    if (cachedProducts) {
      return JSON.parse(cachedProducts) as PaginatedProducts;
    }

    const where: Prisma.ProductWhereInput = {
      isActive: true,
    };

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (categorySlug) {
      where.category = {
        slug: categorySlug,
      };
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === ProductSort.PRICE_ASC
        ? { price: 'asc' }
        : sort === ProductSort.PRICE_DESC
          ? { price: 'desc' }
          : { createdAt: 'desc' };

    const skip = (page - 1) * limit;

    const { total, products } = await this.prisma.$transaction(async (tx) => {
      const total = await tx.product.count({ where });
      const products = await tx.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          price: true,
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      return { total, products };
    });

    const data = products.map((product) => ({
      ...product,
      price: product.price.toString(),
    }));

    const response: PaginatedProducts = {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.redis.set(
      cacheKey,
      JSON.stringify(response),
      ACTIVE_PRODUCTS_CACHE_TTL_SECONDS,
    );

    return response;
  }

  async findOneBySlug(slug: string) {
    const cacheKey = this.getActiveProductCacheKey(slug);
    const cachedProduct = await this.redis.get(cacheKey);

    if (cachedProduct) {
      return JSON.parse(cachedProduct) as PublicProduct;
    }

    const product = await this.prisma.product.findFirst({
      where: {
        slug,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const response: PublicProduct = {
      ...product,
      price: product.price.toString(),
    };

    await this.redis.set(
      cacheKey,
      JSON.stringify(response),
      ACTIVE_PRODUCTS_CACHE_TTL_SECONDS,
    );

    return response;
  }
  async update(id: string, dto: UpdateProductDto) {
    const data: Prisma.ProductUpdateInput = {};
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    if (dto.slug !== undefined) {
      data.slug = dto.slug;
    }

    if (dto.description !== undefined) {
      data.description = dto.description;
    }

    if (dto.stock !== undefined) {
      data.stock = dto.stock;
    }

    if (dto.price !== undefined) {
      const price = new Prisma.Decimal(dto.price);

      if (price.lessThanOrEqualTo(0) || price.greaterThan('99999999.99')) {
        throw new BadRequestException(
          'Price must be between 0.01 and 99999999.99',
        );
      }

      data.price = price;
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (dto.categoryId !== undefined) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
        select: { id: true },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      data.category = {
        connect: { id: category.id },
      };
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field must be provided');
    }

    try {
      const updatedProduct = await this.prisma.product.update({
        where: { id },
        data,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          price: true,
          stock: true,
          isActive: true,
          categoryId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await this.redis.deleteByPattern(ACTIVE_PRODUCTS_CATALOG_CACHE_PATTERN);
      await this.redis.del(this.getActiveProductCacheKey(product.slug));

      if (updatedProduct.slug !== product.slug) {
        await this.redis.del(
          this.getActiveProductCacheKey(updatedProduct.slug),
        );
      }

      return updatedProduct;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Product slug already exists');
      }
      throw error;
    }
  }
  private getActiveProductCacheKey(slug: string): string {
    return `products:active:slug:${slug}:v1`;
  }

  private getActiveProductsCatalogCacheKey(query: ProductQueryDto): string {
    const { page, limit, sort, search, categorySlug } = query;

    return [
      'products',
      'active',
      'catalog',
      `page:${page}`,
      `limit:${limit}`,
      `sort:${sort}`,
      `search:${encodeURIComponent(search ?? '')}`,
      `category:${encodeURIComponent(categorySlug ?? '')}`,
      'v1',
    ].join(':');
  }
}
