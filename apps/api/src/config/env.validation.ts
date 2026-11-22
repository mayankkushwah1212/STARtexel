export function validateEnv(config: Record<string, unknown>) {
  const jwtSecret = config.JWT_SECRET || process.env.JWT_SECRET;
  if (!jwtSecret || typeof jwtSecret !== 'string' || jwtSecret.trim() === '') {
    throw new Error('JWT_SECRET environment variable is missing.');
  }

  return {
    PORT: config.PORT ? Number(config.PORT) : 4000,
    DATABASE_URL: config.DATABASE_URL || process.env.DATABASE_URL,
    DIRECT_URL: config.DIRECT_URL || process.env.DIRECT_URL,
    APP_DB_PASSWORD: config.APP_DB_PASSWORD || process.env.APP_DB_PASSWORD,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: config.JWT_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '2h',
    REDIS_URL: config.REDIS_URL || process.env.REDIS_URL,
    MINIO_ENDPOINT: config.MINIO_ENDPOINT || process.env.MINIO_ENDPOINT,
    MINIO_ROOT_USER: config.MINIO_ROOT_USER || process.env.MINIO_ROOT_USER,
    MINIO_ROOT_PASSWORD: config.MINIO_ROOT_PASSWORD || process.env.MINIO_ROOT_PASSWORD,
    AI_SERVICE_URL: config.AI_SERVICE_URL || process.env.AI_SERVICE_URL,
  };
}
