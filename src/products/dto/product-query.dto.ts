import { Transform, type TransformFnParams, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ProductSort {
  NEWEST = 'newest',
  PRICE_ASC = 'priceAsc',
  PRICE_DESC = 'priceDesc',
}

export class ProductQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @ApiPropertyOptional({
    example: 50,
    minimum: 1,
    maximum: 50,
    default: 50,
  })
  limit = 50;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : (value as unknown),
  )
  @ApiPropertyOptional({
    example: 'playstation',
    maxLength: 100,
    description: 'Searches product name and description',
  })
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : (value as unknown),
  )
  @ApiPropertyOptional({
    example: 'gaming-consoles',
    maxLength: 100,
    description: 'Filter by category slug',
  })
  categorySlug?: string;

  @IsEnum(ProductSort)
  @ApiPropertyOptional({
    enum: ProductSort,
    enumName: 'ProductSort',
    example: ProductSort.NEWEST,
    default: ProductSort.NEWEST,
  })
  sort: ProductSort = ProductSort.NEWEST;
}
