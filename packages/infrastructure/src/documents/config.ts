export function documentPublicOrigin(environment: NodeJS.ProcessEnv = process.env): string {
  const value = environment['DOCUMENT_PUBLIC_ORIGIN'];
  if (!value) throw new Error('DOCUMENT_PUBLIC_ORIGIN is required');
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(
        environment['NODE_ENV'] !== 'production' &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ))
  )
    throw new Error('Invalid DOCUMENT_PUBLIC_ORIGIN');
  return url.origin;
}
