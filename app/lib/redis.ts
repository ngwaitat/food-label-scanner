const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, '');
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redisEnabled = Boolean(upstashUrl && upstashToken);

export async function redisCommand(command: (string | number)[]): Promise<unknown> {
  if (!redisEnabled) return null;
  try {
    const res = await fetch(upstashUrl as string, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${upstashToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[redis] responded ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { result?: unknown };
    return data.result ?? null;
  } catch (error) {
    console.error('[redis] request failed', error);
    return null;
  }
}
