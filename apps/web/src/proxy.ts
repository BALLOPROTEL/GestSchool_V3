import createMiddleware from 'next-intl/middleware';

import { routing } from './i18n/routing';

const localeMiddleware = createMiddleware(routing);
export default function proxy(request: Parameters<typeof localeMiddleware>[0]) {
  const response = localeMiddleware(request);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export const config = {
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
