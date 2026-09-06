import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  agentRules: false,
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

export default withNextIntl(nextConfig);
