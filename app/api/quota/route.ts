import { getQuota, quotaHeaders, resolveIdentity } from '@/app/lib/quota';

export async function GET(req: Request) {
  const { userId, setCookie } = resolveIdentity(req);
  const quota = await getQuota(userId);

  const response = Response.json(quota, { headers: quotaHeaders(quota) });
  if (setCookie) response.headers.append('Set-Cookie', setCookie);
  return response;
}
