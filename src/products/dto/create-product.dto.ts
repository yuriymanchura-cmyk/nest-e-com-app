import { Transform, Type } from 'class-transformer';
import {
  IsDecimal,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProductDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  @ApiProperty({ example: 'PlayStation 5 Slim', maxLength: 160 })
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(160)
  @ApiProperty({
    example: 'playstation-5-slim',
    description: 'Lowercase URL-friendly identifier',
    maxLength: 160,
  })
  slug!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @ApiProperty({
    example: 'Current-generation game console.',
    maxLength: 5000,
  })
  description!: string;

  @IsString()
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  @ApiProperty({
    example: '599.99',
    description: 'Decimal price with up to two fractional digits',
  })
  price!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @ApiProperty({ example: 10, minimum: 0 })
  stock!: number;

  @IsUUID()
  @ApiProperty({
    example: 'e69f1925-e1fd-4d84-a34c-692b84a09782',
    format: 'uuid',
  })
  categoryId!: string;
}
