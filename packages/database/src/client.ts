import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';

export type GestSchoolPrismaClient = PrismaClient;

export function createPrismaClient(databaseUrl: string): GestSchoolPrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
