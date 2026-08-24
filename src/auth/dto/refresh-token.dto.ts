import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Refresh token issued after login',
    format: 'jwt',
    example: 'refresh-token-from-login-response',
  })
  refreshToken!: string;
}
