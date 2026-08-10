import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let authService: AuthService;

  const prismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    jest.resetAllMocks();
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
});
