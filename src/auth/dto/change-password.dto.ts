import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @ApiProperty({
    description: 'Current account password',
    format: 'password',
    example: 'current-password-123',
    minLength: 8,
    maxLength: 128,
  })
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @ApiProperty({
    description: 'New account password',
    format: 'password',
    example: 'new-secure-password-123',
    minLength: 8,
    maxLength: 128,
  })
  newPassword!: string;
}
