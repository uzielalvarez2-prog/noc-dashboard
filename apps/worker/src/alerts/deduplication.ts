import Redis from "ioredis";
import { config } from "../config.js";
import { logger } from "../logger.js";

const DEDUP_TTL_SECONDS = 3600;

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (!config.redis.url) return null;
  if (!redisClient) {
    redisClient = new Redis(config.redis.url, { lazyConnect: true });
    redisClient.on("error", (err) => {
      logger.warn("Redis error", { err: (err as Error).message });
    });
  }
  return redisClient;
}

export async function wasAlertSent(ruleId: string, incidentId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const key = `alertSent:${ruleId}:${incidentId}`;
    return (await redis.exists(key)) === 1;
  } catch {
    return false;
  }
}

export async function markAlertSent(ruleId: string, incidentId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const key = `alertSent:${ruleId}:${incidentId}`;
    await redis.set(key, "1", "EX", DEDUP_TTL_SECONDS);
  } catch {
    // Redis no disponible, omitir
  }
}
