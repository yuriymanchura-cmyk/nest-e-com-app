import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class RestockProductDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({
    example: 10,
    minimum: 1,
    description: 'Number of units to add to the current product stock',
  })
  quantity!: number;
}
