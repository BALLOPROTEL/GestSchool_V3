import { readFile } from 'node:fs/promises';

if (process.env.NODE_ENV === 'production')
  throw new Error('Local messaging inspection is disabled in production');

const fixture = new URL('../.local/messaging-delivery.jsonl', import.meta.url);
let contents;
try {
  contents = await readFile(fixture, 'utf8');
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
    process.stdout.write('No local messages captured yet.\n');
    process.exit(0);
  }
  throw error;
}
for (const line of contents.trim().split('\n').slice(-20)) {
  if (!line) continue;
  const item = JSON.parse(line);
  const address = typeof item.to === 'string' ? item.to : '';
  const masked = address.includes('@')
    ? `${address.slice(0, 1)}***@${address.split('@')[1]}`
    : `***${address.slice(-4)}`;
  process.stdout.write(
    `${item.capturedAt ?? 'unknown'} ${item.channel ?? 'unknown'} ${masked} ${item.subject ?? item.messageId ?? ''}\n`,
  );
}
process.stdout.write('Full local captures remain in .local/messaging-delivery.jsonl (0600).\n');
