/**
 * Secure storage utilities for API keys and tokens
 * 
 * SECURITY BEST PRACTICES IMPLEMENTED:
 * 
 * 1. Uses chrome.storage.local which is:
 *    - Sandboxed per-extension (other extensions cannot access)
 *    - Encrypted at rest on disk (by Chrome)
 *    - Not accessible to web pages or content scripts without explicit messaging
 * 
 * 2. API key validation:
 *    - Format validation before storing (Gemini keys start with "AIza")
 *    - Never logs the actual key value
 *    - Provides masked version for UI display
 * 
 * 3. Token management:
 *    - Stores calendar connection state separately from tokens
 *    - Chrome Identity API manages actual OAuth tokens securely
 *    - We only track connection state, not tokens directly
 * 
 * NOTE: chrome.storage.local is the recommended approach for Chrome extensions.
 * It's more secure than localStorage because:
 * - localStorage is accessible to any script on the page
 * - chrome.storage.local requires explicit extension permissions
 * - Data is isolated per-extension by the browser
 */

const STORAGE_KEYS = {
  GEMINI_API_KEY: 'geminiApiKey',
  USER_NAME: 'userName',
  CALENDAR_CONNECTED: 'calendarConnected',
  SETTINGS_VERSION: 'settingsVersion',
  AI_PROVIDER: 'aiProvider',
  SCROLL_BACK_DAYS: 'scrollBackDays',
  DEBUG_MODE: 'debugMode',
  DAILY_EXTRACT_COUNT: 'dailyExtractCount',
  DAILY_EXTRACT_DATE: 'dailyExtractDate',
  IS_AMBIENT_USER: 'isAmbientUser',
} as const;

// Rate limiting constants
export const DAILY_EXTRACT_LIMIT_DEFAULT = 5;  // Limit for users without Ambient profile
export const DAILY_EXTRACT_LIMIT_AMBIENT = 10; // Limit for users with Ambient profile

// Legacy export for backward compatibility (uses default limit)
export const DAILY_EXTRACT_LIMIT = DAILY_EXTRACT_LIMIT_DEFAULT;

// AI Provider types
export type AIProvider = 'gemini_key' | 'ambient_ai';

// Current settings schema version (for future migrations)
const CURRENT_SETTINGS_VERSION = 1;

/**
 * Save the Gemini API key to local storage
 * 
 * Best Practice: Validate format before storing to catch obvious errors early.
 * Gemini API keys always start with "AIza" prefix.
 */
export async function saveGeminiKey(key: string): Promise<void> {
  const trimmedKey = key.trim();
  
  // Validate key format (Gemini keys start with "AIza")
  if (!trimmedKey) {
    throw new Error('API key cannot be empty');
  }
  
  if (!trimmedKey.startsWith('AIza')) {
    throw new Error('Invalid API key format. Gemini API keys start with "AIza"');
  }
  
  if (trimmedKey.length < 30) {
    throw new Error('API key appears to be too short');
  }
  
  // Store the key - chrome.storage.local handles encryption at rest
  await chrome.storage.local.set({ 
    [STORAGE_KEYS.GEMINI_API_KEY]: trimmedKey,
    [STORAGE_KEYS.SETTINGS_VERSION]: CURRENT_SETTINGS_VERSION
  });
  
  // Log success without exposing the key
  console.log('[Ambient] API key saved successfully');
}

/**
 * Get the stored Gemini API key
 */
export async function getGeminiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.GEMINI_API_KEY);
  return result[STORAGE_KEYS.GEMINI_API_KEY] || null;
}

/**
 * Get a masked version of the API key for display purposes
 * 
 * Best Practice: Never show full API key in UI. Show first 8 and last 4 chars only.
 */
export async function getMaskedGeminiKey(): Promise<string | null> {
  const key = await getGeminiKey();
  if (!key) return null;
  
  if (key.length <= 12) {
    return '****';
  }
  
  return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
}

/**
 * Remove the stored Gemini API key
 */
export async function removeGeminiKey(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.GEMINI_API_KEY);
  console.log('[Ambient] API key removed');
}

/**
 * Validate that a stored API key works by making a minimal API call
 * 
 * Best Practice: Verify credentials work before user starts a long workflow.
 */
export async function validateGeminiKey(key?: string): Promise<{ valid: boolean; error?: string }> {
  const apiKey = key || await getGeminiKey();
  
  if (!apiKey) {
    return { valid: false, error: 'No API key configured' };
  }
  
  try {
    // Make a minimal API call to verify the key works
    // Using the models.list endpoint as it's lightweight
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1/models',
      { 
        method: 'GET',
        headers: { 'x-goog-api-key': apiKey }
      }
    );
    
    if (response.ok) {
      return { valid: true };
    }
    
    if (response.status === 400 || response.status === 403) {
      return { valid: false, error: 'Invalid API key' };
    }
    
    if (response.status === 429) {
      return { valid: false, error: 'API rate limit exceeded. Try again later.' };
    }
    
    return { valid: false, error: `API error: ${response.status}` };
  } catch (error) {
    return { valid: false, error: `Network error: ${(error as Error).message}` };
  }
}

/**
 * Save the user's real name (for LLM prompts)
 */
export async function saveUserName(name: string): Promise<void> {
  const trimmedName = name.trim();
  
  if (!trimmedName) {
    throw new Error('Name cannot be empty');
  }
  
  await chrome.storage.local.set({ [STORAGE_KEYS.USER_NAME]: trimmedName });
}

/**
 * Get the stored user name
 */
export async function getUserName(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.USER_NAME);
  return result[STORAGE_KEYS.USER_NAME] || null;
}

/**
 * Check if an API key is stored
 */
export async function hasGeminiKey(): Promise<boolean> {
  const key = await getGeminiKey();
  return key !== null && key.length > 0;
}

/**
 * Save calendar connection state
 * 
 * Best Practice: We don't store OAuth tokens ourselves - Chrome Identity API
 * manages them securely. We just track whether user has connected.
 */
export async function setCalendarConnected(connected: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.CALENDAR_CONNECTED]: connected });
}

/**
 * Check if calendar is connected
 */
export async function isCalendarConnected(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CALENDAR_CONNECTED);
  return result[STORAGE_KEYS.CALENDAR_CONNECTED] === true;
}

/**
 * Clear all stored settings
 * 
 * Best Practice: Provide a way for users to completely reset the extension.
 */
export async function clearAllSettings(): Promise<void> {
  await chrome.storage.local.clear();
  console.log('[Ambient] All settings cleared');
}

/**
 * Save the selected AI provider
 * 
 * Best Practice: Store user preference for which AI backend to use.
 * - 'gemini_key': User's own Gemini API key (free tier, data may be used for training)
 * - 'ambient_ai': AmbientAI's paid tier (no data training)
 */
export async function saveAIProvider(provider: AIProvider): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.AI_PROVIDER]: provider });
  console.log(`[Ambient] AI provider saved: ${provider}`);
}

/**
 * Get the selected AI provider
 * Defaults to 'gemini_key' if not set
 */
export async function getAIProvider(): Promise<AIProvider> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.AI_PROVIDER);
  return result[STORAGE_KEYS.AI_PROVIDER] || 'gemini_key';
}

/**
 * Check if AI provider setup is complete
 * - For 'ambient_ai': Always complete (no API key needed)
 * - For 'gemini_key': Requires a valid API key
 */
export async function isAIProviderConfigured(): Promise<boolean> {
  const provider = await getAIProvider();
  
  if (provider === 'ambient_ai') {
    return true; // AmbientAI doesn't require user's API key
  }
  
  // For gemini_key provider, check if API key exists
  return await hasGeminiKey();
}

/**
 * Save the scroll back days setting
 * 
 * @param days - Number of days to scroll back (0 = no scrolling)
 */
export async function saveScrollBackDays(days: number): Promise<void> {
  const validDays = Math.max(0, Math.floor(days));
  await chrome.storage.local.set({ [STORAGE_KEYS.SCROLL_BACK_DAYS]: validDays });
  console.log(`[Ambient] Scroll back days saved: ${validDays}`);
}

/**
 * Get the scroll back days setting
 * Defaults to 0 (no scrolling)
 */
export async function getScrollBackDays(): Promise<number> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SCROLL_BACK_DAYS);
  return result[STORAGE_KEYS.SCROLL_BACK_DAYS] ?? 0;
}

/**
 * Save debug mode setting
 * 
 * @param enabled - Whether debug mode is enabled
 */
export async function saveDebugMode(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.DEBUG_MODE]: enabled });
  console.log(`[Ambient] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Get debug mode setting
 * Defaults to false (debug mode off)
 */
export async function getDebugMode(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.DEBUG_MODE);
  return result[STORAGE_KEYS.DEBUG_MODE] === true;
}

/**
 * Get today's date as a string (YYYY-MM-DD format)
 */
function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Get the current daily extract count
 * Resets to 0 if it's a new day
 */
export async function getDailyExtractCount(): Promise<number> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.DAILY_EXTRACT_COUNT,
    STORAGE_KEYS.DAILY_EXTRACT_DATE
  ]);
  
  const storedDate = result[STORAGE_KEYS.DAILY_EXTRACT_DATE];
  const today = getTodayDateString();
  
  // If it's a new day, reset the count
  if (storedDate !== today) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.DAILY_EXTRACT_COUNT]: 0,
      [STORAGE_KEYS.DAILY_EXTRACT_DATE]: today
    });
    return 0;
  }
  
  return result[STORAGE_KEYS.DAILY_EXTRACT_COUNT] || 0;
}

/**
 * Increment the daily extract count
 * Returns the new count
 */
export async function incrementDailyExtractCount(): Promise<number> {
  const currentCount = await getDailyExtractCount();
  const newCount = currentCount + 1;
  const today = getTodayDateString();
  
  await chrome.storage.local.set({
    [STORAGE_KEYS.DAILY_EXTRACT_COUNT]: newCount,
    [STORAGE_KEYS.DAILY_EXTRACT_DATE]: today
  });
  
  const limit = await getDailyExtractLimit();
  console.log(`[Ambient] Daily extract count: ${newCount}/${limit}`);
  return newCount;
}

/**
 * Set the daily extract count to a specific value
 * Used when server says limit reached but local count doesn't match
 */
export async function setDailyExtractCount(count: number): Promise<void> {
  const today = getTodayDateString();
  await chrome.storage.local.set({
    [STORAGE_KEYS.DAILY_EXTRACT_COUNT]: count,
    [STORAGE_KEYS.DAILY_EXTRACT_DATE]: today
  });
  console.log(`[Ambient] Daily extract count set to: ${count}`);
}

/**
 * Check if the daily extract limit has been reached
 */
export async function isDailyExtractLimitReached(): Promise<boolean> {
  const count = await getDailyExtractCount();
  const limit = await getDailyExtractLimit();
  return count >= limit;
}

/**
 * Save the ambient user status
 * 
 * @param isAmbient - Whether the user has an Ambient profile
 */
export async function saveIsAmbientUser(isAmbient: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.IS_AMBIENT_USER]: isAmbient });
  console.log(`[Ambient] Ambient user status saved: ${isAmbient}`);
}

/**
 * Get the ambient user status
 * Defaults to false if not set
 */
export async function getIsAmbientUser(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.IS_AMBIENT_USER);
  return result[STORAGE_KEYS.IS_AMBIENT_USER] === true;
}

/**
 * Get the daily extract limit based on ambient user status
 * Returns 10 for ambient users, 5 for non-ambient users
 */
export async function getDailyExtractLimit(): Promise<number> {
  const isAmbientUser = await getIsAmbientUser();
  return isAmbientUser ? DAILY_EXTRACT_LIMIT_AMBIENT : DAILY_EXTRACT_LIMIT_DEFAULT;
}
