import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { Prisma } from '../generated/prisma/client';
import { AuthRepository } from './auth.repository';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async findByEmail(email: string) {
    return this.authRepository.findUserByEmail(email);
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }
    const passwordHash = await argon2.hash(dto.password);

    try {
      return await this.authRepository.createUser(email, passwordHash);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.findByEmail(email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });

    const { refreshToken, tokenId, expiresAt } = await this.createRefreshToken(
      user.id,
    );

    const tokenHash = await argon2.hash(refreshToken);

    await this.authRepository.createRefreshToken({
      id: tokenId,
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  private async createRefreshToken(
    userId: string,
  ): Promise<{ refreshToken: string; tokenId: string; expiresAt: Date }> {
    const tokenId = randomUUID();

    const refreshToken = await this.jwtService.signAsync<RefreshTokenPayload>(
      {
        sub: userId,
        jti: tokenId,
        type: 'refresh',
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.getOrThrow<StringValue>(
          'JWT_REFRESH_TOKEN_TTL',
        ),
      },
    );

    const payload = this.jwtService.decode<
      RefreshTokenPayload & { exp: number }
    >(refreshToken);

    if (typeof payload.exp !== 'number') {
      throw new InternalServerErrorException('Failed to create refresh token');
    }

    return {
      refreshToken,
      tokenId,
      expiresAt: new Date(payload.exp * 1000),
    };
  }

  private async verifyRefreshToken(
    refreshToken: string,
  ): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );

      if (
        payload.type !== 'refresh' ||
        typeof payload.sub !== 'string' ||
        typeof payload.jti !== 'string'
      ) {
        throw new UnauthorizedException();
      }

      return payload;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private async getValidRefreshToken(
    payload: RefreshTokenPayload,
    refreshToken: string,
  ) {
    const session = await this.authRepository.findRefreshTokenById(payload.jti);

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException();
    }
    const tokenMatches = await argon2.verify(session.tokenHash, refreshToken);

    if (!tokenMatches) {
      throw new UnauthorizedException();
    }

    return session;
  }

  async refresh(dto: RefreshTokenDto) {
    const payload = await this.verifyRefreshToken(dto.refreshToken);

    await this.getValidRefreshToken(payload, dto.refreshToken);

    const user = await this.authRepository.findActiveUserForRefresh(
      payload.sub,
    );

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });

    const { refreshToken, tokenId, expiresAt } = await this.createRefreshToken(
      user.id,
    );

    const tokenHash = await argon2.hash(refreshToken);

    const revokedSession = await this.authRepository.rotateRefreshToken(
      payload.jti,
      user.id,
      { id: tokenId, tokenHash, expiresAt },
    );

    if (revokedSession.count !== 1) {
      throw new UnauthorizedException();
    }

    return {
      accessToken,
      refreshToken,
    };
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    const payload = await this.verifyRefreshToken(dto.refreshToken);

    await this.authRepository.revokeRefreshToken(payload.jti, payload.sub);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.authRepository.findUserById(userId);

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    const isCurrentPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.currentPassword,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Invalid current password');
    }

    const passwordHash = await argon2.hash(dto.newPassword);

    await this.authRepository.updatePasswordAndRevokeSessions(
      user.id,
      passwordHash,
    );
  }

  async getCurrentUser(userId: string) {
    const user = await this.authRepository.findCurrentActiveUser(userId);

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
