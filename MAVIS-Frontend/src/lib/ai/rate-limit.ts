// shortcut: in-memory per-instance sliding window (<= 5000 tracked users), upgrade to Redis when scaling horizontally.
const MAX_TRACKED_USERS = 5000;

export class AiRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("AI request rate limit exceeded");
    this.name = "AiRateLimitError";
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  }
}

export interface RateLimitConfig {
  perMinute?: number;
  perDay?: number;
}

const DEFAULT_PER_MINUTE = 30;
const DEFAULT_PER_DAY = 300;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export function createAiRateLimiter(config: RateLimitConfig = {}) {
  const perMinute = config.perMinute ?? DEFAULT_PER_MINUTE;
  const perDay = config.perDay ?? DEFAULT_PER_DAY;
  const buckets = new Map<string, number[]>();

  function checkAndConsume(userId: string, now = Date.now()): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const key = userId.trim() || "anonymous";
    const existing = buckets.get(key) ?? [];
    const dayCutoff = now - DAY_MS;
    const recent = existing.filter((ts) => ts > dayCutoff);

    const minuteCutoff = now - MINUTE_MS;
    let minuteCount = 0;
    let oldestInMinute = now;
    for (const ts of recent) {
      if (ts > minuteCutoff) {
        minuteCount += 1;
        if (ts < oldestInMinute) oldestInMinute = ts;
      }
    }

    if (minuteCount >= perMinute) {
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestInMinute + MINUTE_MS - now) / 1000));
      buckets.set(key, recent);
      return { allowed: false, retryAfterSeconds };
    }

    if (recent.length >= perDay) {
      const oldestInDay = recent[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestInDay + DAY_MS - now) / 1000));
      buckets.set(key, recent);
      return { allowed: false, retryAfterSeconds };
    }

    recent.push(now);
    if (!buckets.has(key) && buckets.size >= MAX_TRACKED_USERS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
    }
    buckets.set(key, recent);
    return { allowed: true };
  }

  return {
    checkAndConsume,
    assertAllowed(userId: string, now = Date.now()): void {
      const verdict = checkAndConsume(userId, now);
      if (!verdict.allowed) {
        throw new AiRateLimitError(verdict.retryAfterSeconds);
      }
    },
    reset(): void {
      buckets.clear();
    },
  };
}

export const aiDiagramRateLimiter = createAiRateLimiter({
  perMinute: Number(process.env["MAVIS_AI_RATE_LIMIT_PER_MIN"]) > 0 ? Number(process.env["MAVIS_AI_RATE_LIMIT_PER_MIN"]) : DEFAULT_PER_MINUTE,
  perDay: Number(process.env["MAVIS_AI_RATE_LIMIT_PER_DAY"]) > 0 ? Number(process.env["MAVIS_AI_RATE_LIMIT_PER_DAY"]) : DEFAULT_PER_DAY,
});
