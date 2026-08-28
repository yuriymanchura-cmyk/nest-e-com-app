import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoriesRepository } from './categories.repository';

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  async create(dto: CreateCategoryDto) {
    try {
      return await this.categoriesRepository.create(dto);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Category name or slug already exists');
      }

      throw error;
    }
  }

  async findAll() {
    return this.categoriesRepository.findAll();
  }
}
