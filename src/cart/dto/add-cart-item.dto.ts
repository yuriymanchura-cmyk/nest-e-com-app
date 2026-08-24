import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddCartItemDto {
  @IsUUID()
  @ApiProperty({
    example: 'd52aff96-4dbf-4d8c-8cdb-876a6786aa46',
    format: 'uuid',
  })
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({
    example: 2,
    minimum: 1,
  })
  quantity!: number;
}
