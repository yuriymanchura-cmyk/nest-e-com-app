import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DatabaseClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  createUser(email: string, passwordHash: string) {
    return this.prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true, role: true, createdAt: true },
    });
  }

  createRefreshToken(
    data: { id: string; userId: string; tokenHash: string; expiresAt: Date },
    client: DatabaseClient = this.prisma,
  ) {
    return client.refreshToken.create({ data });
  }

  findRefreshTokenById(id: string) {
    return this.prisma.refreshToken.findUnique({ where: { id } });
  }

  findActiveUserForRefresh(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isActive: true },
    });
  }

  revokeRefreshToken(
    id: string,
    userId: string,
    client: DatabaseClient = this.prisma,
    requireUnexpired = false,
  ) {
    return client.refreshToken.updateMany({
      where: {
        id,
        userId,
        revokedAt: null,
        ...(requireUnexpired ? { expiresAt: { gt: new Date() } } : {}),
      },
      data: { revokedAt: new Date() },
    });
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  updatePasswordAndRevokeSessions(userId: string, passwordHash: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  findCurrentActiveUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true, isActive: true },
    });
  }

  rotateRefreshToken(
    previousTokenId: string,
    userId: string,
    nextToken: { id: string; tokenHash: string; expiresAt: Date },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const revokedSession = await this.revokeRefreshToken(
        previousTokenId,
        userId,
        tx,
        true,
      );

      await this.createRefreshToken({ ...nextToken, userId }, tx);

      return revokedSession;
    });
  }
}
