import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { QuotaSnapshot } from '../types';
import { redisCommand, redisEnabled } from './redis';

export const QUOTA_COOKIE = 'foodscanner-user';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1000;
const KEY_PREFIX = 'quota:v1';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const MEMORY_MAX_ENTRIES = 5000;
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

interface MemoryUsage {
  used: number;
  expiresAt: number;
}

const memory = new Map<string, MemoryUsage>();

let warnedAboutSecret = false;

export function dailyLimit(): number {
  const raw = process.env.DAILY_SCAN_LIMIT;
  if (!raw || raw.trim() === '') return 10;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 10;
}

function signingSecret(): string {
  const configured = process.env.QUOTA_COOKIE_SECRET;
  if (configured && configured.trim() !== '') return configured;

  if (process.env.NODE_ENV === 'production' && !warnedAboutSecret) {
    warnedAboutSecret = true;
    console.warn('[quota] QUOTA_COOKIE_SECRET is not set; using an insecure default');
  }
  return 'foodscanner-development-quota-secret';
}

function sign(userId: string): string {
  return createHmac('sha256', signingSecret()).update(userId).digest('base64url');
}

function verifyIdentity(value: string): string | null {
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;

  const userId = value.slice(0, separator);
  if (!USER_ID_PATTERN.test(userId)) return null;

  const provided = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(sign(userId));
  if (provided.length !== expected.length) return null;

  return timingSafeEqual(provided, expected) ? userId : null;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

export function identityCookie(userId: string): string {
  const parts = [
    `${QUOTA_COOKIE}=${userId}.${sign(userId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

export interface Identity {
  userId: string;
  setCookie?: string;
}

export function resolveIdentity(request: Request): Identity {
  const raw = readCookie(request, QUOTA_COOKIE);
  const userId = raw ? verifyIdentity(raw) : null;

  if (userId) return { userId };

  const created = randomUUID();
  return { userId: created, setCookie: identityCookie(created) };
}

interface DayInfo {
  dayKey: string;
  resetsAt: number;
}

function hongKongDay(now: number): DayInfo {
  const shifted = new Date(now + HONG_KONG_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const start = Date.UTC(year, month, day) - HONG_KONG_OFFSET_MS;
  const pad = (value: number) => String(value).padStart(2, '0');

  return {
    dayKey: `${year}-${pad(month + 1)}-${pad(day)}`,
    resetsAt: start + DAY_MS,
  };
}

function quotaKey(userId: string, dayKey: string): string {
  return `${KEY_PREFIX}:${userId}:${dayKey}`;
}

function snapshot(used: number, limit: number, resetsAt: number): QuotaSnapshot {
  const safeUsed = Math.max(0, used);
  return {
    limit,
    used: safeUsed,
    remaining: Math.max(0, limit - safeUsed),
    resetsAt,
  };
}

function pruneMemory(now: number): void {
  if (memory.size < MEMORY_MAX_ENTRIES) return;

  for (const [key, entry] of memory) {
    if (entry.expiresAt <= now) memory.delete(key);
  }
  while (memory.size >= MEMORY_MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

function memoryUsed(key: string, now: number): number {
  const entry = memory.get(key);
  if (!entry) return 0;
  if (entry.expiresAt <= now) {
    memory.delete(key);
    return 0;
  }
  return entry.used;
}

export async function getQuota(userId: string, now = Date.now()): Promise<QuotaSnapshot> {
  const { dayKey, resetsAt } = hongKongDay(now);
  const key = quotaKey(userId, dayKey);
  const limit = dailyLimit();
  let used = memoryUsed(key, now);

  if (redisEnabled) {
    const remote = await redisCommand(['GET', key]);
    if (typeof remote === 'string') {
      const parsed = Number.parseInt(remote, 10);
      if (Number.isFinite(parsed)) used = parsed;
    }
  }

  return snapshot(used, limit, resetsAt);
}

export interface QuotaReservation {
  allowed: boolean;
  quota: QuotaSnapshot;
  dayKey: string;
}

export async function consumeQuota(
  userId: string,
  now = Date.now()
): Promise<QuotaReservation> {
  const { dayKey, resetsAt } = hongKongDay(now);
  const key = quotaKey(userId, dayKey);
  const limit = dailyLimit();
  const expiresAt = resetsAt + HOUR_MS;

  if (redisEnabled) {
    const incremented = await redisCommand(['INCR', key]);
    if (typeof incremented === 'number' && Number.isFinite(incremented)) {
      await redisCommand(['EXPIREAT', key, Math.ceil(expiresAt / 1000)]);

      if (incremented > limit) {
        await redisCommand(['DECR', key]);
        return { allowed: false, quota: snapshot(limit, limit, resetsAt), dayKey };
      }

      return { allowed: true, quota: snapshot(incremented, limit, resetsAt), dayKey };
    }
  }

  pruneMemory(now);
  const used = memoryUsed(key, now);

  if (used >= limit) {
    return { allowed: false, quota: snapshot(limit, limit, resetsAt), dayKey };
  }

  memory.set(key, { used: used + 1, expiresAt });
  return { allowed: true, quota: snapshot(used + 1, limit, resetsAt), dayKey };
}

export async function refundQuota(
  userId: string,
  dayKey: string,
  now = Date.now()
): Promise<void> {
  const key = quotaKey(userId, dayKey);

  if (redisEnabled) {
    const refunded = await redisCommand(['DECR', key]);
    if (typeof refunded === 'number') {
      if (refunded < 0) {
        const { resetsAt } = hongKongDay(now);
        const ttl = Math.max(1, Math.ceil((resetsAt + HOUR_MS - now) / 1000));
        await redisCommand(['SET', key, 0, 'EX', ttl]);
      }
      return;
    }
  }

  const entry = memory.get(key);
  if (!entry) return;
  if (entry.used <= 1) {
    memory.delete(key);
  } else {
    memory.set(key, { ...entry, used: entry.used - 1 });
  }
}

export function quotaHeaders(quota: QuotaSnapshot): Record<string, string> {
  return {
    'Cache-Control': 'no-store',
    'X-RateLimit-Limit': String(quota.limit),
    'X-RateLimit-Remaining': String(quota.remaining),
    'X-RateLimit-Reset': String(Math.ceil(quota.resetsAt / 1000)),
  };
}
