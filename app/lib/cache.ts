import { createHash } from 'node:crypto';
import { redisCommand } from './redis';

const TTL_SECONDS = 60 * 60 * 24 * 30;
const MAX_MEMORY_ENTRIES = 200;

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

const memory = new Map<string, MemoryEntry>();

function readMemory(key: string): string | null {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  memory.delete(key);
  memory.set(key, entry);
  return entry.value;
}

function writeMemory(key: string, value: string): void {
  memory.delete(key);
  memory.set(key, { value, expiresAt: Date.now() + TTL_SECONDS * 1000 });
  while (memory.size > MAX_MEMORY_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

export function hashKey(...parts: string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex');
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const local = readMemory(key);
  if (local !== null) {
    try {
      return JSON.parse(local) as T;
    } catch {
      memory.delete(key);
    }
  }

  const remote = await redisCommand(['GET', key]);
  if (typeof remote !== 'string') return null;

  writeMemory(key, remote);
  try {
    return JSON.parse(remote) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value);
  writeMemory(key, serialized);
  await redisCommand(['SET', key, serialized, 'EX', TTL_SECONDS]);
}
