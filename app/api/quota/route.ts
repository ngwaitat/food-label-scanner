import { getQuota, quotaHeaders, resolveIdentity } from '@/app/lib/quota';

export async function GET(req: Request) {
  const { userId } = resolveIdentity(req);
  const quota = await getQuota(userId);

  return Response.json(quota, { headers: quotaHeaders(quota) });
}
