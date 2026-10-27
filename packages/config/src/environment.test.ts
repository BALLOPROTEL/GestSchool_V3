import { describe, expect, it } from 'vitest';

import { loadInfrastructureConfig } from './environment.js';

const validEnvironment = {
  API_PORT: '3100',
  DATABASE_URL: 'postgresql://gestschool:local@127.0.0.1:5432/gestschool',
  NODE_ENV: 'development',
  REDIS_URL: 'redis://:local@127.0.0.1:6379',
  S3_ACCESS_KEY_ID: 'gestschool-local',
  S3_BUCKET: 'gestschool-local-private',
  S3_ENDPOINT: 'http://127.0.0.1:9000/',
  S3_FORCE_PATH_STYLE: 'true',
  S3_REGION: 'us-east-1',
  S3_SECRET_ACCESS_KEY: 'local-secret',
} satisfies NodeJS.ProcessEnv;

describe('loadInfrastructureConfig', () => {
  it('normalizes a complete local environment', () => {
    expect(loadInfrastructureConfig(validEnvironment)).toEqual({
      apiHost: '127.0.0.1',
      apiPort: 3100,
      databaseUrl: validEnvironment.DATABASE_URL,
      nodeEnvironment: 'development',
      redisUrl: validEnvironment.REDIS_URL,
      storage: {
        accessKeyId: 'gestschool-local',
        bucket: 'gestschool-local-private',
        endpoint: 'http://127.0.0.1:9000',
        forcePathStyle: true,
        region: 'us-east-1',
        secretAccessKey: 'local-secret',
      },
    });
  });

  it('binds explicitly to a managed host and its PORT without changing local defaults', () => {
    const { API_PORT: _port, ...environment } = validEnvironment;
    const config = loadInfrastructureConfig({ ...environment, API_HOST: '0.0.0.0', PORT: '10000' });
    expect(config.apiHost).toBe('0.0.0.0');
    expect(config.apiPort).toBe(10000);
    expect(
      loadInfrastructureConfig({ ...environment, API_PORT: '3200', PORT: '10000' }).apiPort,
    ).toBe(3200);
    expect(() => loadInfrastructureConfig({ ...environment, PORT: 'invalid' })).toThrow();
    expect(() =>
      loadInfrastructureConfig({ ...environment, API_HOST: 'attacker.example.com' }),
    ).toThrow();
  });

  it('reports every missing mandatory dependency setting clearly', () => {
    expect(() => loadInfrastructureConfig({ NODE_ENV: 'development' })).toThrow(
      /DATABASE_URL: Invalid input.*REDIS_URL: Invalid input.*S3_ACCESS_KEY_ID/s,
    );
  });

  it('rejects invalid protocols and boolean values', () => {
    expect(() =>
      loadInfrastructureConfig({
        ...validEnvironment,
        DATABASE_URL: 'https://example.com/database',
        S3_FORCE_PATH_STYLE: 'yes',
      }),
    ).toThrow(/DATABASE_URL: must use the postgresql: protocol.*S3_FORCE_PATH_STYLE/s);
  });
});
