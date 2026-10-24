import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isLocale, LOCALE_COOKIE, STRINGS } from '@/app/i18n';
import { evaluateGeo } from '@/app/lib/geo';

function blockedPage(): string {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>香港以外地區未能使用 · Not available in your region</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f8fafc; color: #0f172a; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 420px; text-align: center; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px 24px; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06); }
  h1 { margin: 0 0 12px; font-size: 1.25rem; }
  p { margin: 8px 0 0; color: #475569; font-size: 0.95rem; line-height: 1.6; }
</style>
</head>
<body>
<main>
  <h1>本服務目前只供香港用戶使用</h1>
  <p>This service is currently only available to users in Hong Kong.</p>
  <p>如果你身處香港但仍見到這個頁面，請檢查你的網絡連線或 VPN 設定。</p>
  <p>If you are in Hong Kong and still see this page, check your network or VPN settings.</p>
</main>
</body>
</html>`;
}

export function proxy(request: NextRequest) {
  const geo = evaluateGeo(request);
  if (geo.allowed) {
    return NextResponse.next();
  }

  const headers = {
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
  };

  if (request.nextUrl.pathname.startsWith('/api/')) {
    const storedLocale = request.cookies.get(LOCALE_COOKIE)?.value;
    const locale = isLocale(storedLocale) ? storedLocale : 'zh-Hant';
    return NextResponse.json(
      { error: STRINGS[locale].regionBlocked },
      { status: 403, headers }
    );
  }

  return new NextResponse(blockedPage(), {
    status: 403,
    headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'],
};
