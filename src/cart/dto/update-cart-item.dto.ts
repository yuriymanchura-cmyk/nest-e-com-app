import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({
    example: 3,
    minimum: 1,
  })
  quantity!: number;
}
