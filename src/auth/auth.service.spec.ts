import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { Prisma } from '../generated/prisma/client';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';

type RefreshTokenData = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

let createdRefreshTokenArgs: RefreshTokenData | undefined;

const createRefreshToken = jest.fn((data: RefreshTokenData): Promise<void> => {
  createdRefreshTokenArgs = data;
  return Promise.resolve();
});

describe('AuthService', () => {
  let authService: AuthService;

  const jwtService = {
    signAsync: jest.fn(),
    decode: jest.fn(),
  };

  const authRepository = {
    findUserByEmail: jest.fn(),
    createUser: jest.fn(),
    createRefreshToken,
  };

  const configService = {
    getOrThrow: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRepository, useValue: authRepository },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    jest.resetAllMocks();
    createdRefreshTokenArgs = undefined;
    createRefreshToken.mockImplementation(
      (data: RefreshTokenData): Promise<void> => {
        createdRefreshTokenArgs = data;
        return Promise.resolve();
      },
    );
  });

  it('throws ConflictException when email is already registered', async () => {
    authRepository.findUserByEmail.mockResolvedValue({ id: 'user-id' });

    await expect(
      authService.register({
        email: ' TEST@EXAMPLE.COM ',
        password: 'secure-password-123',
      }),
    ).rejects.toThrow(ConflictException);

    expect(authRepository.findUserByEmail).toHaveBeenCalledWith(
      'test@example.com',
    );
    expect(authRepository.createUser).not.toHaveBeenCalled();
  });

  it('creates a user when email is available', async () => {
    const createdUser = {
      id: 'user-id',
      email: 'new@example.com',
      role: 'CUSTOMER',
      createdAt: new Date('2026-08-09T00:00:00.000Z'),
    };

    authRepository.findUserByEmail.mockResolvedValue(null);
    authRepository.createUser.mockResolvedValue(createdUser);

    const result = await authService.register({
      email: ' New@Example.com ',
      password: 'secure-password-123',
    });

    expect(result).toEqual(createdUser);
    expect(authRepository.createUser).toHaveBeenCalledWith(
      'new@example.com',
      expect.any(String),
    );
  });

  it('maps a unique email constraint error to ConflictException', async () => {
    authRepository.findUserByEmail.mockResolvedValue(null);
    authRepository.createUser.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.9.1',
      }),
    );

    await expect(
      authService.register({
        email: 'new@example.com',
        password: 'secure-password-123',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('returns an access token for valid credentials', async () => {
    const password = 'secure-password-123';
    const passwordHash = await argon2.hash(password);

    authRepository.findUserByEmail.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash,
      role: 'CUSTOMER',
      isActive: true,
    });

    jwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');

    jwtService.decode.mockReturnValue({
      exp: 1780000000,
    });

    configService.getOrThrow
      .mockReturnValueOnce('refresh-secret')
      .mockReturnValueOnce('7d');
    const result = await authService.login({
      email: ' USER@EXAMPLE.COM ',
      password,
    });

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(createRefreshToken).toHaveBeenCalledTimes(1);

    if (!createdRefreshTokenArgs) {
      throw new Error('Refresh token session was not created');
    }

    expect(createdRefreshTokenArgs.userId).toBe('user-id');
    expect(typeof createdRefreshTokenArgs.id).toBe('string');
    expect(typeof createdRefreshTokenArgs.tokenHash).toBe('string');
    expect(createdRefreshTokenArgs.tokenHash).not.toBe('refresh-token');
    expect(createdRefreshTokenArgs.expiresAt).toEqual(
      new Date(1780000000 * 1000),
    );

    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 'user-id',
      role: 'CUSTOMER',
    });
  });

  it('rejects login with a wrong password', async () => {
    const passwordHash = await argon2.hash('correct-password-123');

    authRepository.findUserByEmail.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash,
      role: 'CUSTOMER',
      isActive: true,
    });

    await expect(
      authService.login({
        email: 'user@example.com',
        password: 'wrong-password-123',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rejects login for an inactive user', async () => {
    authRepository.findUserByEmail.mockResolvedValue({
      id: 'user-id',
      email: 'user@example.com',
      passwordHash: 'unused-password-hash',
      role: 'CUSTOMER',
      isActive: false,
    });

    await expect(
      authService.login({
        email: 'user@example.com',
        password: 'secure-password-123',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
});
