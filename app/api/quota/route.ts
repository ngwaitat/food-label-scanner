import { getQuota, quotaHeaders, resolveIdentity } from '@/app/lib/quota';

export async function GET(req: Request) {
  const identity = resolveIdentity(req);
  const quota = await getQuota(identity.userId);
  const headers = new Headers(quotaHeaders(quota));

  if (identity.setCookie) headers.append('Set-Cookie', identity.setCookie);

  return Response.json(quota, { headers });
}
