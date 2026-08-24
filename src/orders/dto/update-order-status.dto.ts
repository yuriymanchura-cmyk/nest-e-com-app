import { IsEnum } from 'class-validator';
import { OrderStatus } from '../../generated/prisma/enums';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  @ApiProperty({
    enum: OrderStatus,
    enumName: 'OrderStatus',
    example: OrderStatus.PROCESSING,
    description: 'Next allowed order status',
  })
  status!: OrderStatus;
}
