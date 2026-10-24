export function securityHeaders(production) {
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'self' blob:",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline'${production ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    `connect-src 'self'${production ? '' : ' ws: wss:'}`,
  ].join('; ');
  return [
    { key: 'Content-Security-Policy', value: policy },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ...(production ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
  ];
}

// next start consumes build-time rewrites; checking runtime variables alone is insufficient.
export function validateBuildApiOrigin(manifest, expectedOrigin) {
  try {
    const rewrites = Array.isArray(manifest.rewrites)
      ? manifest.rewrites
      : [
          ...manifest.rewrites.beforeFiles,
          ...manifest.rewrites.afterFiles,
          ...manifest.rewrites.fallback,
        ];
    const targets = rewrites.filter((route) => route.source === '/api/v1/:path*');
    if (targets.length !== 1) throw new Error();
    const target = new URL(targets[0].destination);
    if (
      target.protocol !== 'https:' ||
      target.username ||
      target.password ||
      target.origin !== expectedOrigin
    )
      throw new Error();
  } catch {
    throw new Error(
      'Production API rewrite must match the validated HTTPS API_INTERNAL_URL; rebuild with the same origin',
    );
  }
}
