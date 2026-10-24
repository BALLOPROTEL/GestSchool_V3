import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { securityHeaders, validateBuildApiOrigin } from './security-headers.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requirePublicHttps } from '@gestschool/config/security';

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: { remotePatterns: [], dangerouslyAllowSVG: false },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders(process.env.NODE_ENV === 'production') }];
  },
  // Verification URLs contain bearer tokens; never include them in development access logs.
  logging: { incomingRequests: { ignore: [/\/(verify|activation|reset-password)(\/|\?|$)/] } },
  transpilePackages: ['@gestschool/ui'],
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env['API_INTERNAL_URL'] ?? 'http://127.0.0.1:3100'}/api/v1/:path*`,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default function configuration(phase: string) {
  // Building is not a deployed runtime. Local production-build E2E explicitly uses NODE_ENV=test.
  if (phase === 'phase-production-server' && process.env.NODE_ENV === 'production') {
    requirePublicHttps(process.env['APP_PUBLIC_ORIGIN'], 'APP_PUBLIC_ORIGIN', true);
    const api = requirePublicHttps(process.env['API_INTERNAL_URL'], 'API_INTERNAL_URL', true);
    validateBuildApiOrigin(
      JSON.parse(
        readFileSync(join(process.cwd(), '.next/routes-manifest.json'), 'utf8'),
      ) as unknown,
      api.origin,
    );
  }
  return withNextIntl(nextConfig);
}
