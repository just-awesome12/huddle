import type { NextConfig } from 'next';

/**
 * Security headers (Phase 9). Applied to every route. The perimeter
 * (Cloudflare WAF / Bot Fight / rate limiting) is dashboard config
 * documented in docs/SECURITY.md — these are the in-app defences:
 *
 *   - HSTS: force HTTPS for two years (no-op on localhost http).
 *   - X-Frame-Options + frame-ancestors: no clickjacking via embedding.
 *   - X-Content-Type-Options: no MIME sniffing.
 *   - Referrer-Policy: don't leak full URLs cross-origin.
 *   - Permissions-Policy: deny powerful features we never use.
 *   - X-Robots-Tag: noindex — Huddle is a private, auth-walled app; we
 *     never want it crawled or indexed (robots.ts also disallows all).
 *   - CSP: shipped REPORT-ONLY first (notes in ROADMAP Phase 9) so we
 *     observe violations before enforcing. 'unsafe-inline' is tolerated
 *     for now; tighten to nonces before enforcement.
 */

// Supabase origin(s) the browser legitimately talks to (REST/Realtime/
// Storage). Read at build from the public env so the policy matches the
// target environment; falls back to local.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_WS = SUPABASE_URL.replace(/^http/, 'ws');
const TURNSTILE = 'https://challenges.cloudflare.com';

const cspReportOnly = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `img-src 'self' data: blob: ${SUPABASE_URL}`,
  `script-src 'self' 'unsafe-inline' ${TURNSTILE}`,
  `style-src 'self' 'unsafe-inline'`,
  `font-src 'self' data:`,
  `connect-src 'self' ${SUPABASE_URL} ${SUPABASE_WS} ${TURNSTILE}`,
  `frame-src ${TURNSTILE}`,
  `form-action 'self'`,
].join('; ');

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Photo uploads travel through Server Actions as FormData
      // (Phase 5.3). The client compresses to ≤1MB before submit;
      // 4mb leaves headroom for FormData overhead and the other
      // fields without inviting huge bodies. Default is 1mb.
      bodySizeLimit: '4mb',
    },
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
