import { PrismaClient } from '@prisma/client';

// Next dev hot-reload tạo lại module liên tục; giữ một instance trên globalThis
// để không mở tràn connection tới Postgres.
const g = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  g.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') g.prisma = prisma;
