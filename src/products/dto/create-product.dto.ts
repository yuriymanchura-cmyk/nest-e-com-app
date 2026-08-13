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

export class CreateProductDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(160)
  slug!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  @IsString()
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  price!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock!: number;

  @IsUUID()
  categoryId!: string;
}
