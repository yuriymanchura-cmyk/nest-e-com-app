import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    example: false,
    description: 'Whether the product is visible in the public catalog',
  })
  isActive?: boolean;
}
