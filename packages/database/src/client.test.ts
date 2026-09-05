import { describe, expect, it } from 'vitest';

import { createPrismaClient } from './client.js';

describe('createPrismaClient', () => {
  it('constructs a PostgreSQL client without connecting eagerly', async () => {
    const client = createPrismaClient('postgresql://local:local@127.0.0.1:1/local');

    expect(client).toBeDefined();
    await client.$disconnect();
  });
});
