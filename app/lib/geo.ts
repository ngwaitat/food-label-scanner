const DEFAULT_COUNTRY_HEADER = 'x-vercel-ip-country';
const UNKNOWN_COUNTRY_CODES = new Set(['XX', 'T1']);

let warnedMissingHeader = false;

export type GeoReason = 'disabled' | 'development' | 'allowed' | 'blocked' | 'unknown';

export interface GeoResult {
  allowed: boolean;
  country: string | null;
  reason: GeoReason;
}

function normalizeCountry(value: string | null): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  if (UNKNOWN_COUNTRY_CODES.has(code)) return null;
  return code;
}

function allowedCountries(): string[] {
  const configured = process.env.GEO_ALLOWED_COUNTRIES ?? 'HK';
  return configured
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code));
}

export function evaluateGeo(request: { headers: Headers }): GeoResult {
  if (process.env.GEO_DISABLED === '1') {
    return { allowed: true, country: null, reason: 'disabled' };
  }

  if (process.env.NODE_ENV !== 'production') {
    return { allowed: true, country: null, reason: 'development' };
  }

  const headerName = process.env.GEO_COUNTRY_HEADER || DEFAULT_COUNTRY_HEADER;
  const country = normalizeCountry(request.headers.get(headerName));

  if (!country) {
    if (!warnedMissingHeader) {
      warnedMissingHeader = true;
      console.warn(`[geo] ${headerName} is missing or unknown; applying fallback policy`);
    }
    const failClosed = process.env.GEO_FAIL_CLOSED === '1';
    return { allowed: !failClosed, country: null, reason: 'unknown' };
  }

  if (allowedCountries().includes(country)) {
    return { allowed: true, country, reason: 'allowed' };
  }

  console.warn(`[geo] blocked request from ${country}`);
  return { allowed: false, country, reason: 'blocked' };
}
