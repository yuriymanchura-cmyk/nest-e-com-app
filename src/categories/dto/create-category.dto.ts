import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @ApiProperty({
    example: 'Gaming & Consoles',
    maxLength: 80,
  })
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(100)
  @ApiProperty({
    example: 'gaming-consoles',
    description: 'Lowercase URL-friendly identifier',
    maxLength: 100,
  })
  slug!: string;
}
