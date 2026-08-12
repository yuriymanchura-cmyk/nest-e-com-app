import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '../src/generated/prisma/client';

const connectionString = process.env['DATABASE_URL'];
const adminEmail = process.env['ADMIN_EMAIL'];

if (!connectionString || !adminEmail) {
  throw new Error('DATABASE_URL and ADMIN_EMAIL must be set');
}

const normalizedAdminEmail = adminEmail.trim().toLowerCase();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main(): Promise<void> {
  const user = await prisma.user.update({
    where: {
      email: normalizedAdminEmail,
    },
    data: {
      role: Role.ADMIN,
    },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });
  console.log(`Admin role assigned to ${user.email}`);
}

main()
  .catch((error: unknown) => {
    console.error('Failed to seed admin user', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
