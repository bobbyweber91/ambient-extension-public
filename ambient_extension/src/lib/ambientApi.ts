/**
 * AmbientAI API client
 * Handles communication with the Django server for AI processing
 * using Ambient's paid Gemini tier (no data training).
 */

import type { ConversationDict, ExtractedEvent, CalendarEvent, MatchUpdate } from '../types';
import { getCalendarToken } from './calendarAuth';

// API base URL - production server
const AMBIENT_API_BASE = 'https://tryambientai.com/extension_endpoint';
const AMBIENT_TRIPS_BASE = 'https://tryambientai.com';

// For local development, uncomment these lines:
// const AMBIENT_API_BASE = 'http://localhost:8000/extension_endpoint';
// const AMBIENT_TRIPS_BASE = 'http://localhost:8000';

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
 * Extract events from an uploaded file via AmbientAI
 */
export async function extractEventsFromFileViaAmbient(
  fileBase64: string,
  mimeType: string,
  fileName: string
): Promise<ExtractEventsResult> {
  const googleToken = await getCalendarToken();

  const response = await fetch(`${AMBIENT_API_BASE}/extract_from_file/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${googleToken}`,
    },
    body: JSON.stringify({
      file_data: fileBase64,
      mime_type: mimeType,
      file_name: fileName,
    }),
  });

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

  const isAmbientUser = data.is_ambient_user ?? isAmbientUserFromHeader;

  return {
    events: data.events || [],
    isAmbientUser,
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

interface CreateTripResponse {
  success: boolean;
  trip_id: number | null;
  share_token: string | null;
  share_url: string | null;
  events_created: number;
  is_ambient_user?: boolean;
  error: string | null;
}

export interface CreateTripResult {
  tripId: number;
  shareToken: string;
  shareUrl: string;
  eventsCreated: number;
  isAmbientUser: boolean;
}

/**
 * Persist a trip + its sibling events on the Ambient backend.
 *
 * The extension is expected to have already:
 *   1. extracted events from the conversation (via extractEventsViaAmbient),
 *   2. created a per-trip Google Calendar via createCalendar(),
 *   3. inserted events into that calendar.
 *
 * This call records the same data on the server as a Trip + sibling CalendarUpdates so
 * the trip is reachable at /trip/<share_token>/ and discoverable by signed-in users via
 * the My Trips dashboard.
 *
 * @param tripEvent - The parent trip event (its summary must contain "trip")
 * @param siblingEvents - Other events scraped from the same conversation
 * @param googleCalendarId - The per-trip calendar id (already created client-side)
 * @param setPublicReadAclServerSide - If true, the server will also set the calendar's
 *   ACL to public-read as a backstop (in case the client-side call failed)
 */
export async function createTripViaAmbient(
  tripEvent: ExtractedEvent,
  siblingEvents: ExtractedEvent[],
  googleCalendarId: string,
  setPublicReadAclServerSide: boolean = true,
): Promise<CreateTripResult> {
  const googleToken = await getCalendarToken();

  const response = await fetch(`${AMBIENT_API_BASE}/create_trip/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${googleToken}`,
    },
    body: JSON.stringify({
      trip_event: tripEvent,
      sibling_events: siblingEvents,
      google_calendar_id: googleCalendarId,
      set_calendar_public_read: setPublicReadAclServerSide,
    }),
  });

  const isAmbientUserHeader = response.headers.get('X-Ambient-User');
  const isAmbientUserFromHeader = isAmbientUserHeader === 'true';

  if (!response.ok) {
    const errorMessage = await parseErrorResponse(response);
    throw new Error(`Trip creation failed: ${errorMessage}`);
  }

  const data: CreateTripResponse = await response.json();
  if (!data.success || !data.share_token || !data.share_url || data.trip_id == null) {
    throw new Error(data.error || 'Unknown error creating trip');
  }

  return {
    tripId: data.trip_id,
    shareToken: data.share_token,
    shareUrl: data.share_url,
    eventsCreated: data.events_created,
    isAmbientUser: data.is_ambient_user ?? isAmbientUserFromHeader,
  };
}


// ---------------------------------------------------------------------------
// Trip detail + edit endpoints
// ---------------------------------------------------------------------------
//
// These hit /api/trips/<share_token>/... directly (NOT under /extension_endpoint/).
// Auth model is link-as-capability: the share_token in the URL plus an `X-Ambient-Source:
// extension` header lets the extension call edit endpoints without an Ambient login.
//
// Used by the re-import flow (compare scraped events vs. existing trip events, then apply
// PATCH/POST/DELETE) and by any future "update accommodation from chat" sweeps.

export interface TripEventDetail {
  id: number;
  is_trip_parent: boolean;
  summary: string;
  description: string;
  location: string;
  start: { date?: string; dateTime?: string; timeZone?: string } | null;
  end: { date?: string; dateTime?: string; timeZone?: string } | null;
  flight_details: { passenger?: string; flight_number?: string; destination?: string } | null;
  gcal_event_id: string | null;
}

export interface TripDetail {
  share_token: string;
  summary: string;
  description: string;
  location: string;
  start: { date?: string; dateTime?: string; timeZone?: string } | null;
  end: { date?: string; dateTime?: string; timeZone?: string } | null;
  accommodation_details: string;
  booking_accommodation_details: string;
  google_calendar_id: string | null;
  events: TripEventDetail[];
}

/**
 * Fetch a trip's metadata + events as JSON. Public endpoint — share_token alone authorizes.
 * Returns null if the trip can't be reached (404, network error). The caller surfaces this
 * to the user.
 */
export async function getTripDetails(shareToken: string): Promise<TripDetail | null> {
  try {
    const response = await fetch(`${AMBIENT_TRIPS_BASE}/api/trips/${encodeURIComponent(shareToken)}/`, {
      method: 'GET',
      headers: { 'X-Ambient-Source': 'extension' },
    });
    if (!response.ok) {
      console.warn(`[Ambient] getTripDetails: HTTP ${response.status} for token=${shareToken}`);
      return null;
    }
    const data: { success: boolean; trip?: TripDetail } = await response.json();
    if (!data.success || !data.trip) return null;
    return data.trip;
  } catch (e) {
    console.warn('[Ambient] getTripDetails: network error', e);
    return null;
  }
}

interface TripEditOk { success: true; [k: string]: unknown }
interface TripEditErr { success: false; error?: string; login_required?: boolean }
type TripEditResponse = TripEditOk | TripEditErr;

async function tripEditFetch(
  path: string,
  method: 'PATCH' | 'POST' | 'DELETE',
  body?: unknown,
): Promise<TripEditResponse> {
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Ambient-Source': 'extension',
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${AMBIENT_TRIPS_BASE}${path}`, init);
  // DELETE returns 200 with {success: true} on success; treat all other 2xx the same way.
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    return { success: false, error: data?.error || `HTTP ${response.status}` };
  }
  return data || { success: true };
}

/** PATCH the trip's metadata + accommodation. Body keys are all optional. */
export function patchTrip(shareToken: string, body: {
  summary?: string;
  description?: string;
  location?: string;
  start?: TripDetail['start'];
  end?: TripDetail['end'];
  accommodation_details?: string;
}): Promise<TripEditResponse> {
  return tripEditFetch(`/api/trips/${encodeURIComponent(shareToken)}/`, 'PATCH', body);
}

/** Add a new event under this trip. summary is required; everything else optional. */
export function addTripEvent(shareToken: string, body: {
  summary: string;
  description?: string;
  location?: string;
  start?: TripDetail['start'];
  end?: TripDetail['end'];
  flight_details?: TripEventDetail['flight_details'];
}): Promise<TripEditResponse> {
  return tripEditFetch(`/api/trips/${encodeURIComponent(shareToken)}/events/`, 'POST', body);
}

/** Update an existing event by its CalendarUpdate.pk. Fields not in body are unchanged. */
export function updateTripEvent(shareToken: string, eventId: number, body: {
  summary?: string;
  description?: string;
  location?: string;
  start?: TripDetail['start'];
  end?: TripDetail['end'];
  flight_details?: TripEventDetail['flight_details'];
}): Promise<TripEditResponse> {
  return tripEditFetch(`/api/trips/${encodeURIComponent(shareToken)}/events/${eventId}/`, 'PATCH', body);
}

/** Delete an event by its CalendarUpdate.pk. Server rejects deleting the parent trip event. */
export function deleteTripEvent(shareToken: string, eventId: number): Promise<TripEditResponse> {
  return tripEditFetch(`/api/trips/${encodeURIComponent(shareToken)}/events/${eventId}/`, 'DELETE');
}
