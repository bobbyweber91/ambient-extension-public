/**
 * Google Calendar OAuth authentication using Chrome Identity API
 * 
 * SECURITY BEST PRACTICES IMPLEMENTED:
 * 
 * 1. Uses Chrome Identity API (`chrome.identity.getAuthToken`):
 *    - Chrome manages token storage securely (encrypted, per-profile)
 *    - Tokens are automatically refreshed by Chrome
 *    - No need to store tokens ourselves
 *    - Revocation is handled properly
 * 
 * 2. Minimal scopes requested:
 *    - calendar.events: Create/update events
 *    - calendar.readonly: Read existing events for matching
 *    - We do NOT request full calendar access
 * 
 * 3. Token refresh handling:
 *    - If a token fails (401), we remove cached token and retry
 *    - This handles expired tokens gracefully
 * 
 * 4. User consent:
 *    - `interactive: true` shows Google's consent screen
 *    - User explicitly approves access
 *    - User can revoke at any time in Google Account settings
 * 
 * SETUP REQUIRED:
 * Before this works, you need to:
 * 1. Create a project in Google Cloud Console
 * 2. Enable the Google Calendar API
 * 3. Create OAuth 2.0 credentials (Chrome Extension type)
 * 4. Add your extension ID to authorized origins
 * 5. Update manifest.json with your client_id
 */

import { setCalendarConnected, isCalendarConnected } from './storage';

/**
 * Get an OAuth token for Google Calendar API
 * 
 * Best Practice: Use Chrome's built-in identity API which:
 * - Handles token refresh automatically
 * - Stores tokens securely in Chrome's credential store
 * - Shares tokens with user's Google account across Chrome
 * 
 * @param interactive - If true, shows consent UI if not already authorized
 * @returns OAuth access token
 */
export async function getCalendarToken(interactive: boolean = true): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, async (token) => {
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError.message || 'Failed to get auth token';
        console.error('[Ambient] OAuth error:', error);
        
        // Update connection state
        await setCalendarConnected(false);
        
        // Handle scope changes - user needs to re-authorize with new scopes
        // This happens when we add new scopes (like 'openid') to manifest.json
        if (error.includes('OAuth2 not granted') || error.includes('invalid_scope')) {
          // Clear old token and prompt re-auth if interactive
          try {
            await removeCachedTokenInternal();
          } catch {
            // Ignore errors clearing token
          }
          
          if (interactive) {
            // Retry with fresh consent - this will show the consent screen with new scopes
            console.log('[Ambient] Scopes may have changed, requesting fresh consent...');
            chrome.identity.getAuthToken({ interactive: true }, async (newToken) => {
              if (chrome.runtime.lastError || !newToken) {
                reject(new Error('Please reconnect your Google Calendar to continue.'));
                return;
              }
              await setCalendarConnected(true);
              console.log('[Ambient] Calendar token obtained after re-authorization');
              resolve(newToken);
            });
            return;
          } else {
            reject(new Error('Calendar access needs to be re-authorized. Please reconnect your calendar.'));
            return;
          }
        }
        
        // Provide user-friendly error messages for other errors
        if (error.includes('invalid_client')) {
          reject(new Error('Extension not configured correctly. Please contact the developer.'));
        } else if (error.includes('network')) {
          reject(new Error('Network error. Please check your connection and try again.'));
        } else {
          reject(new Error(error));
        }
        return;
      }
      
      if (!token) {
        await setCalendarConnected(false);
        reject(new Error('No token received. Please try again.'));
        return;
      }
      
      // Successfully got token
      await setCalendarConnected(true);
      console.log('[Ambient] Calendar token obtained successfully');
      resolve(token);
    });
  });
}

/**
 * Internal helper to remove cached token without calling getCalendarToken
 * Used during re-authorization flow to avoid recursion
 */
async function removeCachedTokenInternal(): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.clearAllCachedAuthTokens(() => {
      console.log('[Ambient] Cleared all cached auth tokens');
      resolve();
    });
  });
}

/**
 * Check if we have a valid cached token (non-interactive check)
 * 
 * Best Practice: Check token validity before starting operations
 * to avoid interrupting user mid-workflow.
 */
export async function hasValidToken(): Promise<boolean> {
  try {
    // Try to get token non-interactively
    await getCalendarToken(false);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the cached OAuth token
 * 
 * Best Practice: Implement proper token removal for:
 * - User-initiated disconnection
 * - Token refresh when current token fails
 * 
 * @param token - The token to remove (optional, will fetch if not provided)
 */
export async function removeCachedToken(token?: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    // Get the current token if not provided
    let tokenToRemove = token;
    if (!tokenToRemove) {
      try {
        tokenToRemove = await getCalendarToken(false);
      } catch {
        // No token to remove
        await setCalendarConnected(false);
        resolve();
        return;
      }
    }
    
    chrome.identity.removeCachedAuthToken({ token: tokenToRemove }, async () => {
      if (chrome.runtime.lastError) {
        console.error('[Ambient] Error removing token:', chrome.runtime.lastError.message);
        // Still mark as disconnected even if removal had issues
      }
      
      await setCalendarConnected(false);
      console.log('[Ambient] Calendar token removed');
      resolve();
    });
  });
}

/**
 * Disconnect from Google Calendar (revoke access)
 * 
 * Best Practice: Allow users to fully revoke access, not just clear cache.
 * This revokes the token on Google's servers too.
 */
export async function disconnectCalendar(): Promise<void> {
  try {
    // Get current token
    const token = await getCalendarToken(false);
    
    // Revoke the token on Google's servers
    const response = await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    if (!response.ok && response.status !== 400) {
      // 400 means token was already invalid, which is fine
      console.warn('[Ambient] Token revocation returned status:', response.status);
    }
    
    // Remove from local cache
    await removeCachedToken(token);
    
    console.log('[Ambient] Calendar disconnected and token revoked');
  } catch (error) {
    // If we can't revoke (maybe already revoked), just clear local state
    await removeCachedToken();
    console.log('[Ambient] Calendar disconnected (could not revoke token)');
  }
}

/**
 * Make an authenticated request to Google Calendar API
 * 
 * Best Practice: Centralized request function that handles:
 * - Adding auth header
 * - Token refresh on 401
 * - Consistent error handling
 * 
 * @param endpoint - API endpoint (without base URL)
 * @param options - Fetch options
 * @param retryCount - Internal retry counter
 */
export async function calendarFetch(
  endpoint: string,
  options: RequestInit = {},
  retryCount: number = 0
): Promise<Response> {
  const token = await getCalendarToken();
  
  const url = `https://www.googleapis.com/calendar/v3${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  
  // Handle token expiration - retry once with fresh token
  if (response.status === 401 && retryCount < 1) {
    console.log('[Ambient] Token expired, refreshing...');
    await removeCachedToken(token);
    return calendarFetch(endpoint, options, retryCount + 1);
  }
  
  return response;
}

/**
 * Get connection status with details
 */
export async function getConnectionStatus(): Promise<{
  connected: boolean;
  hasToken: boolean;
  error?: string;
}> {
  const connected = await isCalendarConnected();
  
  if (!connected) {
    return { connected: false, hasToken: false };
  }
  
  // Verify token is still valid
  const hasToken = await hasValidToken();
  
  if (!hasToken) {
    await setCalendarConnected(false);
    return { connected: false, hasToken: false, error: 'Token expired' };
  }
  
  return { connected: true, hasToken: true };
}
