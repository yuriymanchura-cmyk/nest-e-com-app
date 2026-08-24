import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
  ApiNoContentResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import {
  type AuthenticatedRequest,
  JwtAuthGuard,
} from './jwt-auth/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new customer account' })
  @ApiCreatedResponse({ description: 'Customer account created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid registration payload' })
  @ApiConflictResponse({ description: 'Email is already registered' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiOperation({ summary: 'Authenticate and issue a token pair' })
  @ApiOkResponse({
    description: 'Access and refresh tokens issued successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid login payload' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiTooManyRequestsResponse({
    description: 'Too many login attempts. Try again later.',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token and issue a new token pair' })
  @ApiOkResponse({
    description: 'New access and refresh tokens issued successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid refresh token payload' })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, revoked, or already used refresh token',
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current refresh token session' })
  @ApiNoContentResponse({
    description: 'Refresh token session revoked successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid logout payload' })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Patch('password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change the current user password' })
  @ApiNoContentResponse({ description: 'Password changed successfully' })
  @ApiUnauthorizedResponse({
    description: 'Missing, expired, invalid token, or wrong current password',
  })
  @ApiBadRequestResponse({
    description: 'Invalid password change payload',
  })
  changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    return this.authService.changePassword(request.user!.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current authenticated user' })
  @ApiOkResponse({ description: 'Current authenticated user' })
  @ApiUnauthorizedResponse({
    description: 'Missing, expired, or invalid access token',
  })
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return this.authService.getCurrentUser(request.user!.sub);
  }
}
