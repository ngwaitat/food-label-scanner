import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { QuotaSnapshot } from '../types';
import { redisCommand, redisEnabled } from './redis';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1000;
const KEY_PREFIX = 'quota:v1';
const MEMORY_MAX_ENTRIES = 5000;
const IPV4_WITH_PORT = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
const UNKNOWN_IP = 'unknown';
const VISITOR_COOKIE = 'fs_quota_id';
const VISITOR_COOKIE_MAX_AGE = 365 * DAY_MS / 1000;
const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

interface MemoryUsage {
  used: number;
  expiresAt: number;
}

const memory = new Map<string, MemoryUsage>();

let warnedAboutSecret = false;

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const value = raw.trim().toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') return true;
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') return false;
  return fallback;
}

export function dailyLimitEnabled(): boolean {
  return envFlag('DAILY_SCAN_LIMIT_ENABLED', true);
}

export function dailyLimit(): number {
  const raw = process.env.DAILY_SCAN_LIMIT;
  if (!raw || raw.trim() === '') return 10;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 10;
}

function quotaSecret(): string {
  const configured = process.env.QUOTA_COOKIE_SECRET;
  if (configured && configured.trim() !== '') return configured;

  if (process.env.NODE_ENV === 'production' && !warnedAboutSecret) {
    warnedAboutSecret = true;
    console.warn('[quota] QUOTA_COOKIE_SECRET is not set; using an insecure default');
  }
  return 'foodscanner-development-quota-secret';
}

function normalizeIp(value: string): string {
  let ip = value.trim();

  if (ip.startsWith('[') && ip.includes(']')) {
    ip = ip.slice(1, ip.indexOf(']'));
  } else {
    const ipv4 = IPV4_WITH_PORT.exec(ip);
    if (ipv4) ip = ipv4[1];
  }

  if (ip.toLowerCase().startsWith('::ffff:')) ip = ip.slice(7);
  return ip.toLowerCase();
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return normalizeIp(first);
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return normalizeIp(realIp);

  const cloudflareIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cloudflareIp) return normalizeIp(cloudflareIp);

  return UNKNOWN_IP;
}

export interface Identity {
  userId: string;
  /** Set-Cookie value to send when the visitor has no signed quota cookie yet. */
  setCookie?: string;
}

function signVisitorId(id: string): string {
  return createHmac('sha256', quotaSecret()).update(`visitor:${id}`).digest('base64url');
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }

  return null;
}

function verifiedVisitorId(raw: string | null): string | null {
  if (!raw) return null;

  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return null;

  const id = raw.slice(0, separator);
  if (!VISITOR_ID_PATTERN.test(id)) return null;

  const provided = Buffer.from(raw.slice(separator + 1));
  const expected = Buffer.from(signVisitorId(id));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  return id;
}

// Quota is tracked per browser cookie rather than per IP: mobile carriers rotate
// IPv4/IPv6 addresses and CGNAT shares one address between many users, so an IP
// identity both resets quotas too easily and pools unrelated users together.
// A signed cookie survives IP changes and keeps the visitor id tamper-proof.
export function resolveIdentity(request: Request): Identity {
  const visitorId = verifiedVisitorId(readCookie(request, VISITOR_COOKIE));
  if (visitorId) {
    return {
      userId: createHmac('sha256', quotaSecret()).update(`visitor:${visitorId}`).digest('base64url'),
    };
  }

  // Requests without the cookie fall back to the IP identity so that clients
  // which drop cookies still hit a limit instead of getting a fresh quota each time.
  const fallbackId = createHmac('sha256', quotaSecret())
    .update(`ip:${clientIp(request)}`)
    .digest('base64url');

  const id = randomBytes(16).toString('base64url');
  const cookie = [
    `${VISITOR_COOKIE}=${id}.${signVisitorId(id)}`,
    'Path=/',
    `Max-Age=${VISITOR_COOKIE_MAX_AGE}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (process.env.NODE_ENV === 'production') cookie.push('Secure');

  return { userId: fallbackId, setCookie: cookie.join('; ') };
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
    enabled: true,
  };
}

function disabledSnapshot(): QuotaSnapshot {
  return { limit: 0, used: 0, remaining: 0, resetsAt: 0, enabled: false };
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
  if (!dailyLimitEnabled()) return disabledSnapshot();

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
  if (!dailyLimitEnabled()) {
    return { allowed: true, quota: disabledSnapshot(), dayKey };
  }

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
  if (!dailyLimitEnabled()) return;

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
