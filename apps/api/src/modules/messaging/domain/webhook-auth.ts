import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const brevoEvent = z.object({
  event: z.string().min(1).max(80),
  'message-id': z.string().min(1).max(255),
  ts_event: z.number().int().positive(),
});

export function validBrevoBearer(header: string | undefined, secret: string): boolean {
  if (!header?.startsWith('Bearer ') || secret.length < 32) return false;
  const supplied = header.slice(7);
  if (supplied.length > 512) return false;
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

export function validateBrevoEvent(input: unknown, now = Date.now()) {
  const event = brevoEvent.parse(input);
  // Brevo retries may arrive later; a 24-hour window avoids accepting stale
  // captured payloads while the unique digest handles duplicate callbacks.
  if (Math.abs(now - event.ts_event * 1000) > 86_400_000) throw new Error('BREVO_WEBHOOK_STALE');
  const key = createHash('sha256')
    .update(`${event['message-id']}\0${event.event}\0${event.ts_event}`)
    .digest('hex');
  return { ...event, key };
}
