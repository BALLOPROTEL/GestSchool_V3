import { z } from 'zod';

export const globalSearchKinds = [
  'student',
  'guardian',
  'teacher',
  'class',
  'enrollment',
  'invoice',
  'document',
] as const;

export type GlobalSearchKind = (typeof globalSearchKinds)[number];

export const globalSearchQuery = z.strictObject({
  q: z.string().trim().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(25).default(20),
});

export type GlobalSearchQuery = z.infer<typeof globalSearchQuery>;

export interface GlobalSearchResult {
  kind: GlobalSearchKind;
  id: string;
  title: string;
  subtitle?: string;
  resourcePath: string;
}

export interface GlobalSearchResponse {
  items: GlobalSearchResult[];
}
