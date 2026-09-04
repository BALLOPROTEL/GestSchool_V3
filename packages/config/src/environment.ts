import { z } from 'zod';

const postgresUrl = z.url().refine((value) => new URL(value).protocol === 'postgresql:', {
  message: 'must use the postgresql: protocol',
});

const redisUrl = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'redis:' || protocol === 'rediss:';
  },
  { message: 'must use the redis: or rediss: protocol' },
);

const booleanValue = z.enum(['true', 'false']).transform((value) => value === 'true');

const environmentSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
  DATABASE_URL: postgresUrl,
  NODE_ENV: z.enum(['development', 'test', 'production']),
  REDIS_URL: redisUrl,
  S3_ACCESS_KEY_ID: z.string().trim().min(1),
  S3_BUCKET: z
    .string()
    .trim()
    .min(3)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/, 'must be a valid S3 bucket name'),
  S3_ENDPOINT: z.url(),
  S3_FORCE_PATH_STYLE: booleanValue,
  S3_REGION: z.string().trim().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(8),
});

export type InfrastructureConfig = Readonly<{
  apiPort: number;
  databaseUrl: string;
  nodeEnvironment: 'development' | 'test' | 'production';
  redisUrl: string;
  storage: Readonly<{
    accessKeyId: string;
    bucket: string;
    endpoint: string;
    forcePathStyle: boolean;
    region: string;
    secretAccessKey: string;
  }>;
}>;

export function loadInfrastructureConfig(
  environment: NodeJS.ProcessEnv = process.env,
): InfrastructureConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid GestSchool environment: ${details}`);
  }

  return {
    apiPort: result.data.API_PORT,
    databaseUrl: result.data.DATABASE_URL,
    nodeEnvironment: result.data.NODE_ENV,
    redisUrl: result.data.REDIS_URL,
    storage: {
      accessKeyId: result.data.S3_ACCESS_KEY_ID,
      bucket: result.data.S3_BUCKET,
      endpoint: result.data.S3_ENDPOINT.replace(/\/$/, ''),
      forcePathStyle: result.data.S3_FORCE_PATH_STYLE,
      region: result.data.S3_REGION,
      secretAccessKey: result.data.S3_SECRET_ACCESS_KEY,
    },
  };
}
