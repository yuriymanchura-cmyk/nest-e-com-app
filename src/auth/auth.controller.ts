import {
  Body,
  Controller,
  Post,
  HttpStatus,
  HttpCode,
  UseGuards,
  Get,
  Req,
  Patch,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthService } from './auth.service';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from './jwt-auth/jwt-auth.guard';
import { ChangePasswordDto } from './dto/change-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('password')
  changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.authService.changePassword(request.user!.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return this.authService.getCurrentUser(request.user!.sub);
  }
}
