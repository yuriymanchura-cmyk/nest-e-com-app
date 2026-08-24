import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @ApiProperty({
    example: 'customer@example.com',
    format: 'email',
  })
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @ApiProperty({
    example: 'secure-password-123',
    format: 'password',
    minLength: 8,
    maxLength: 128,
  })
  password!: string;
}
