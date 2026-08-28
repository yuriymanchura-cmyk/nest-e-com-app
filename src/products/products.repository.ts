import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCategoryId(id: string) {
    return this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
  }

  create(data: Prisma.ProductCreateArgs) {
    return this.prisma.product.create({
      ...data,
    });
  }

  findActiveCatalog(
    where: Prisma.ProductWhereInput,
    orderBy: Prisma.ProductOrderByWithRelationInput,
    skip: number,
    take: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const total = await tx.product.count({ where });
      const products = await tx.product.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          price: true,
          category: { select: { id: true, name: true, slug: true } },
        },
      });

      return { total, products };
    });
  }

  findActiveBySlug(slug: string) {
    return this.prisma.product.findFirst({
      where: { slug, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        price: true,
        category: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  findById(id: string) {
    return this.prisma.product.findUnique({ where: { id } });
  }

  update(id: string, data: Prisma.ProductUpdateInput) {
    return this.prisma.product.update({
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
  }
}
