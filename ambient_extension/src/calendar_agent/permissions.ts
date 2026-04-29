/**
 * Optional host permission utilities for the calendar agent.
 * Requests per-domain permissions that persist across sessions.
 */

/**
 * Extract the origin pattern from a URL for permission requests.
 * e.g., "https://www.cathedralschool.net/calendar?..." → "https://www.cathedralschool.net/*"
 */
export function getOriginPattern(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}/*`;
}

/**
 * Check if we already have host permission for a given URL's origin.
 */
export async function hasHostPermission(url: string): Promise<boolean> {
  const pattern = getOriginPattern(url);
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: [pattern] }, (result) => {
      resolve(result);
    });
  });
}

/**
 * Request host permission for a URL's origin.
 * Must be called from a user gesture context (e.g., button click handler).
 * Returns true if granted, false if denied.
 */
export async function requestHostPermission(url: string): Promise<boolean> {
  const pattern = getOriginPattern(url);
  return new Promise((resolve) => {
    chrome.permissions.request({ origins: [pattern] }, (granted) => {
      resolve(granted);
    });
  });
}

/**
 * Ensure we have host permission for a tab's URL.
 * Checks first, only prompts if not already granted.
 */
export async function ensureHostPermission(url: string): Promise<boolean> {
  if (await hasHostPermission(url)) {
    return true;
  }
  return requestHostPermission(url);
}
