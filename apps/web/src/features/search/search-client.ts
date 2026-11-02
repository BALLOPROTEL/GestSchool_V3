import type { GlobalSearchResponse } from '@gestschool/contracts';

import { peopleRequest } from '../directory/people-client';

export function globalSearchRequest(
  query: string,
  signal?: AbortSignal,
): Promise<GlobalSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: '20' });
  return peopleRequest<GlobalSearchResponse>(
    `search?${params}`,
    undefined,
    'GET',
    true,
    {},
    signal,
  );
}
