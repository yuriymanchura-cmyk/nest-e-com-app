import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

type CreateRefreshTokenArgs = {
  data: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  };
};

let createdRefreshTokenArgs: CreateRefreshTokenArgs | undefined;

const createRefreshToken = jest.fn(
  (args: CreateRefreshTokenArgs): Promise<void> => {
    createdRefreshTokenArgs = args;
    return Promise.resolve();
  },
);

describe('AuthService', () => {
  let authService: AuthService;

  const prismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: createRefreshToken,
    },
  };

  const jwtService = {
    signAsync: jest.fn(),
    decode: jest.fn(),
  };

  const configService = {
    getOrThrow: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
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
      (args: CreateRefreshTokenArgs): Promise<void> => {
        createdRefreshTokenArgs = args;
        return Promise.resolve();
      },
    );
  });

  it('throws ConflictException when email is already registered', async () => {
    prismaService.user.findUnique.mockResolvedValue({ id: 'user-id' });

    await expect(
      authService.register({
        email: ' TEST@EXAMPLE.COM ',
        password: 'secure-password-123',
      }),
    ).rejects.toThrow(ConflictException);

    expect(prismaService.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    });
    expect(prismaService.user.create).not.toHaveBeenCalled();
  });

  it('creates a user when email is available', async () => {
    const createdUser = {
      id: 'user-id',
      email: 'new@example.com',
      role: 'CUSTOMER',
      createdAt: new Date('2026-08-09T00:00:00.000Z'),
    };

    prismaService.user.findUnique.mockResolvedValue(null);
    prismaService.user.create.mockResolvedValue(createdUser);

    const result = await authService.register({
      email: ' New@Example.com ',
      password: 'secure-password-123',
    });

    expect(result).toEqual(createdUser);
    expect(prismaService.user.create).toHaveBeenCalledTimes(1);
  });

  it('maps a unique email constraint error to ConflictException', async () => {
    prismaService.user.findUnique.mockResolvedValue(null);
    prismaService.user.create.mockRejectedValue(
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

    prismaService.user.findUnique.mockResolvedValue({
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

    expect(createdRefreshTokenArgs.data.userId).toBe('user-id');
    expect(typeof createdRefreshTokenArgs.data.id).toBe('string');
    expect(typeof createdRefreshTokenArgs.data.tokenHash).toBe('string');
    expect(createdRefreshTokenArgs.data.tokenHash).not.toBe('refresh-token');
    expect(createdRefreshTokenArgs.data.expiresAt).toEqual(
      new Date(1780000000 * 1000),
    );

    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 'user-id',
      role: 'CUSTOMER',
    });
  });

  it('rejects login with a wrong password', async () => {
    const passwordHash = await argon2.hash('correct-password-123');

    prismaService.user.findUnique.mockResolvedValue({
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
    prismaService.user.findUnique.mockResolvedValue({
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
