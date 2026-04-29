/**
 * Deterministic hash for calendar event deduplication.
 * Hash key: lowercase(summary) + startDate + lowercase(location ?? "")
 */

import type { ExtractedEvent } from '../types';

export function computeEventHash(event: ExtractedEvent): string {
  const summary = (event.summary || '').toLowerCase();
  const startDate = event.start?.dateTime || event.start?.date || '';
  const location = (event.location || '').toLowerCase();
  const input = summary + startDate + location;
  return cyrb53(input).toString(36);
}

/**
 * cyrb53 — a fast, high-quality 53-bit string hash.
 * Collision-resistant enough for event deduplication.
 */
function cyrb53(str: string, seed: number = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
