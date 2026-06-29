// Global setup for the 'integration' Vitest project (node environment).
// Runs before every integration test file.

import { beforeAll, afterAll } from 'vitest';
import { resetTestDb } from '../helpers/db';

beforeAll(async () => {
  await resetTestDb();
});

afterAll(async () => {
  // Disconnect Prisma client so the process exits cleanly.
  const { prisma } = await import('@/lib/prisma');
  await prisma.$disconnect();
});
