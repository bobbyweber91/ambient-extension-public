/**
 * AmbientAI API client
 * Handles communication with the Django server for AI processing
 * using Ambient's paid Gemini tier (no data training).
 */

import type { ConversationDict, ExtractedEvent, CalendarEvent, MatchUpdate } from '../types';
import { getCalendarToken } from './calendarAuth';

// API base URL - production server
const AMBIENT_API_BASE = 'https://tryambientai.com/extension_endpoint';

// For local development, uncomment this line:
// const AMBIENT_API_BASE = 'http://localhost:8000/extension_endpoint';

interface ExtractEventsResponse {
  success: boolean;
  events: ExtractedEvent[] | null;
  error: string | null;
  is_ambient_user?: boolean;
}

interface FindMatchesResponse {
  success: boolean;
  match_result: MatchUpdate | null;
  error: string | null;
  is_ambient_user?: boolean;
}

// Result types that include is_ambient_user
export interface ExtractEventsResult {
  events: ExtractedEvent[];
  isAmbientUser: boolean;
}

export interface MatchEventResult {
  matchResult: MatchUpdate;
  isAmbientUser: boolean;
}

interface HealthCheckResponse {
  status: string;
  api_configured: boolean;
}

interface CheckProfileResponse {
  success: boolean;
  is_ambient_user: boolean;
  email: string | null;
  error: string | null;
}

export interface CheckProfileResult {
  isAmbientUser: boolean;
  email: string;
  error?: string;
}

/**
 * Parse error response from the API
 * Handles both JSON and plain text error responses
 */
async function parseErrorResponse(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type');
  
  try {
    if (contentType?.includes('application/json')) {
      const errorData = await response.json();
      // Django returns validation errors in the 'error' field
      if (errorData.error) {
        return errorData.error;
      }
      // Fallback to stringifying the whole response
      return JSON.stringify(errorData);
    } else {
      return await response.text();
    }
  } catch {
    return `HTTP ${response.status}: ${response.statusText}`;
  }
}

/**
 * Extract events from a conversation via AmbientAI
 * 
 * @param conversation - The conversation object from DOM parsing
 * @param userName - The user's name for prompt context
 * @returns Object containing extracted events and ambient user status
 * @throws Error if the API call fails
 */
export async function extractEventsViaAmbient(
  conversation: ConversationDict,
  userName: string
): Promise<ExtractEventsResult> {
  // Get the Google OAuth token (same one used for Calendar)
  const googleToken = await getCalendarToken();
  
  const response = await fetch(`${AMBIENT_API_BASE}/extract_event/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${googleToken}`,
    },
    body: JSON.stringify({
      conversation,
      user_name: userName,
    }),
  });

  // Try to get is_ambient_user from header (available even on error responses)
  const isAmbientUserHeader = response.headers.get('X-Ambient-User');
  const isAmbientUserFromHeader = isAmbientUserHeader === 'true';

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    throw new Error(`Validation error: ${errorMessage}`);
  }

  const data: ExtractEventsResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Unknown error from AmbientAI');
  }

  // Prefer is_ambient_user from response body, fall back to header
  const isAmbientUser = data.is_ambient_user ?? isAmbientUserFromHeader;

  return {
    events: data.events || [],
    isAmbientUser
  };
}

/**
 * Match an extracted event against calendar events via AmbientAI
 * 
 * @param event - The extracted event to match
 * @param calendarEvents - Array of calendar events to match against
 * @returns Object containing match result and ambient user status
 * @throws Error if the API call fails
 */
export async function matchEventViaAmbient(
  event: ExtractedEvent,
  calendarEvents: CalendarEvent[]
): Promise<MatchEventResult> {
  // Get the Google OAuth token (same one used for Calendar)
  const googleToken = await getCalendarToken();
  
  const response = await fetch(`${AMBIENT_API_BASE}/find_matches/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${googleToken}`,
    },
    body: JSON.stringify({
      event,
      calendar_events: calendarEvents,
    }),
  });

  // Try to get is_ambient_user from header (available even on error responses)
  const isAmbientUserHeader = response.headers.get('X-Ambient-User');
  const isAmbientUserFromHeader = isAmbientUserHeader === 'true';

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    throw new Error(`Validation error: ${errorMessage}`);
  }

  const data: FindMatchesResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Unknown error from AmbientAI');
  }

  // Prefer is_ambient_user from response body, fall back to header
  const isAmbientUser = data.is_ambient_user ?? isAmbientUserFromHeader;

  if (!data.match_result) {
    // Return a default no_match result if null
    return {
      matchResult: {
        match_data: {
          match_type: 'no_match',
          matched_event: null,
          matched_event_id: null,
        },
      },
      isAmbientUser
    };
  }

  return {
    matchResult: data.match_result,
    isAmbientUser
  };
}

/**
 * Check if the AmbientAI API is available and configured
 * 
 * @returns Health check status
 */
export async function checkAmbientApiHealth(): Promise<HealthCheckResponse> {
  try {
    const response = await fetch(`${AMBIENT_API_BASE}/health/`, {
      method: 'GET',
    });

    if (!response.ok) {
      return {
        status: 'error',
        api_configured: false,
      };
    }

    return await response.json();
  } catch (error) {
    return {
      status: 'unreachable',
      api_configured: false,
    };
  }
}

/**
 * Check if the user has an Ambient profile linked to their Google account.
 * Does NOT count against rate limits.
 * 
 * @returns Object containing profile status and masked email
 * @throws Error if the API call fails or user is not authenticated
 */
export async function checkAmbientProfile(): Promise<CheckProfileResult> {
  // Get the Google OAuth token (same one used for Calendar)
  const googleToken = await getCalendarToken();
  
  const url = `${AMBIENT_API_BASE}/check_profile/`;
  console.log(`[Ambient] Checking profile at: ${url}`);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${googleToken}`,
    },
  });

  console.log(`[Ambient] Profile check response status: ${response.status}`);

  if (!response.ok) {
    // Provide clearer error messages for common HTTP errors
    if (response.status === 404) {
      throw new Error('Profile check endpoint not found. Server may need to be restarted.');
    }
    if (response.status === 401) {
      throw new Error('Authentication failed. Please reconnect your Google Calendar.');
    }
    const errorMessage = await parseErrorResponse(response);
    throw new Error(`Server error (${response.status}): ${errorMessage.substring(0, 100)}`);
  }

  const data: CheckProfileResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Unknown error checking profile');
  }

  return {
    isAmbientUser: data.is_ambient_user,
    email: data.email || '',
  };
}
