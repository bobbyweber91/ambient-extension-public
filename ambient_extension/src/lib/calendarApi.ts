/**
 * Google Calendar API CRUD operations
 * 
 * BEST PRACTICES IMPLEMENTED:
 * 
 * 1. RESTful API usage:
 *    - Uses Google Calendar REST API directly (no SDK needed)
 *    - Minimizes bundle size vs importing full SDK
 *    - Clear mapping to API documentation
 * 
 * 2. Error handling:
 *    - Specific error types for different failure modes
 *    - User-friendly error messages
 *    - Rate limit awareness (429 status)
 * 
 * 3. Efficient querying:
 *    - Uses timeMin/timeMax to limit date range
 *    - Requests only needed fields
 *    - Single request for multiple calendars' events
 * 
 * 4. Type safety:
 *    - Full TypeScript interfaces for API responses
 *    - Matches Google Calendar API v3 schema
 */

import { calendarFetch } from './calendarAuth';
import type { CalendarEvent, DateTimeInfo } from '../types';

/**
 * Google Calendar API response types
 */
interface CalendarListEntry {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole: string;
  backgroundColor?: string;
}

interface CalendarListResponse {
  items: CalendarListEntry[];
  nextPageToken?: string;
}

interface EventsListResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
}

interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  htmlLink?: string;
  attendees?: Array<{
    email: string;
    responseStatus?: string;
    displayName?: string;
  }>;
  status?: string;
  created?: string;
  updated?: string;
  recurringEventId?: string; // Present if this is an instance of a recurring event
}

/**
 * API error with specific type
 */
export class CalendarApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = 'CalendarApiError';
  }
}

/**
 * List all calendars the user has access to
 * 
 * Best Practice: Let user choose which calendar to use, or default to primary.
 * Handles pagination to ensure all calendars are returned.
 */
export async function listCalendars(): Promise<CalendarListEntry[]> {
  const allCalendars: CalendarListEntry[] = [];
  let pageToken: string | undefined;
  
  do {
    const params = new URLSearchParams();
    if (pageToken) {
      params.set('pageToken', pageToken);
    }
    
    const endpoint = `/users/me/calendarList${params.toString() ? `?${params}` : ''}`;
    const response = await calendarFetch(endpoint);
    
    if (!response.ok) {
      await handleApiError(response);
    }
    
    const data: CalendarListResponse = await response.json();
    allCalendars.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  
  return allCalendars;
}

/**
 * Get the primary calendar
 */
export async function getPrimaryCalendar(): Promise<CalendarListEntry | null> {
  const calendars = await listCalendars();
  return calendars.find(cal => cal.primary) || calendars[0] || null;
}

/**
 * Find a calendar by name (summary)
 * 
 * @param name - The name/summary of the calendar to find
 * @returns The calendar if found, null otherwise
 */
export async function findCalendarByName(name: string): Promise<CalendarListEntry | null> {
  const calendars = await listCalendars();
  return calendars.find(cal => cal.summary.toLowerCase() === name.toLowerCase()) || null;
}

/**
 * Create a new calendar
 * 
 * @param summary - The name of the calendar
 * @returns The created calendar
 */
export async function createCalendar(summary: string): Promise<CalendarListEntry> {
  console.log('[Ambient] Creating new calendar:', summary);
  
  const response = await calendarFetch('/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Ambient] Failed to create calendar:', errorText);
    await handleApiError(response);
  }
  
  const created: CalendarListEntry = await response.json();
  console.log('[Ambient] Calendar created successfully:', created.summary, 'ID:', created.id);
  
  return created;
}

/**
 * Get or create the "ambient" calendar
 * 
 * Checks if a calendar named "ambient" exists. If it does, returns its ID.
 * If not, creates it and returns the new calendar's ID.
 * 
 * @returns The ID of the "ambient" calendar
 */
export async function getOrCreateAmbientCalendar(): Promise<string> {
  console.log('[Ambient] Looking for ambient calendar...');
  
  // Check if ambient calendar already exists
  const existingCalendar = await findCalendarByName('ambient');
  
  if (existingCalendar) {
    console.log('[Ambient] Found existing ambient calendar:', existingCalendar.id);
    return existingCalendar.id;
  }
  
  // Create the ambient calendar
  console.log('[Ambient] Ambient calendar not found, creating...');
  const newCalendar = await createCalendar('ambient');
  
  return newCalendar.id;
}

/**
 * Fetch events from a calendar within a date range
 * 
 * Best Practice: Always use date range to limit results.
 * Fetching all events is inefficient and slow.
 * Handles pagination to ensure all events in the range are returned.
 * 
 * @param calendarId - Calendar ID (use 'primary' for user's main calendar)
 * @param timeMin - Start of date range (ISO string)
 * @param timeMax - End of date range (ISO string)
 * @param maxResultsPerPage - Maximum events per API call (default 250)
 * @param excludeRecurring - If true, filters out instances of recurring events (default true)
 */
export async function getEvents(
  calendarId: string = 'primary',
  timeMin: string,
  timeMax: string,
  maxResultsPerPage: number = 250,
  excludeRecurring: boolean = true
): Promise<CalendarEvent[]> {
  const allEvents: CalendarEvent[] = [];
  let pageToken: string | undefined;
  
  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults: String(maxResultsPerPage),
      singleEvents: 'true', // Expand recurring events into instances
      orderBy: 'startTime',
    });
    
    if (pageToken) {
      params.set('pageToken', pageToken);
    }
    
    const response = await calendarFetch(
      `/calendars/${encodeURIComponent(calendarId)}/events?${params}`
    );
    
    if (!response.ok) {
      await handleApiError(response);
    }
    
    const data: EventsListResponse = await response.json();
    let events = (data.items || []).map(event => convertToCalendarEvent(event, calendarId));
    
    // Filter out recurring event instances if requested
    if (excludeRecurring) {
      events = events.filter(event => !event.recurringEventId);
    }
    
    allEvents.push(...events);
    pageToken = data.nextPageToken;
  } while (pageToken);
  
  return allEvents;
}

/**
 * Get events from multiple calendars
 * 
 * Best Practice: For matching, we need to check all calendars the user might use.
 */
export async function getEventsFromAllCalendars(
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const calendars = await listCalendars();
  
  // Fetch events from all calendars in parallel
  const eventPromises = calendars
    .filter(cal => cal.accessRole !== 'reader') // Skip read-only calendars
    .map(cal => 
      getEvents(cal.id, timeMin, timeMax)
        .catch(error => {
          console.warn(`[Ambient] Failed to fetch events from ${cal.summary}:`, error);
          return []; // Return empty array on error
        })
    );
  
  const eventsArrays = await Promise.all(eventPromises);
  return eventsArrays.flat();
}

/**
 * Create a new event
 * 
 * @param calendarId - Calendar to create event in (default 'primary')
 * @param event - Event details
 */
export async function createEvent(
  event: Partial<CalendarEvent>,
  calendarId: string = 'primary'
): Promise<CalendarEvent> {
  console.log('[Ambient] createEvent called with:', JSON.stringify(event, null, 2));
  console.log('[Ambient] Target calendar:', calendarId);
  
  const googleEvent = convertToGoogleEvent(event);
  console.log('[Ambient] Converted to Google format:', JSON.stringify(googleEvent, null, 2));
  
  console.log('[Ambient] Making POST request to Calendar API...');
  const response = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      body: JSON.stringify(googleEvent),
    }
  );
  
  console.log('[Ambient] Response status:', response.status, response.statusText);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Ambient] Calendar API error response:', errorText);
    await handleApiError(response);
  }
  
  const created: GoogleCalendarEvent = await response.json();
  console.log('[Ambient] Event created successfully:', created.summary, 'ID:', created.id);
  
  return convertToCalendarEvent(created, calendarId);
}

/**
 * Update an existing event
 * 
 * Best Practice: Use PATCH for partial updates instead of PUT for full replace.
 * 
 * @param calendarId - Calendar ID
 * @param eventId - Event ID to update
 * @param updates - Fields to update
 */
export async function updateEvent(
  eventId: string,
  updates: Partial<CalendarEvent>,
  calendarId: string = 'primary'
): Promise<CalendarEvent> {
  console.log('[Ambient] updateEvent called with eventId:', eventId);
  console.log('[Ambient] Updates to apply:', JSON.stringify(updates, null, 2));
  console.log('[Ambient] Target calendar:', calendarId);
  
  const googleEvent = convertToGoogleEvent(updates);
  console.log('[Ambient] Converted to Google format:', JSON.stringify(googleEvent, null, 2));
  
  console.log('[Ambient] Making PATCH request to Calendar API...');
  const response = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(googleEvent),
    }
  );
  
  console.log('[Ambient] Response status:', response.status, response.statusText);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Ambient] Calendar API error response:', errorText);
    console.error('[Ambient] Failed update object:', JSON.stringify(updates, null, 2));
    console.error('[Ambient] Failed Google event object:', JSON.stringify(googleEvent, null, 2));
    await handleApiError(response);
  }
  
  const updated: GoogleCalendarEvent = await response.json();
  console.log('[Ambient] Event updated successfully:', updated.summary, 'ID:', updated.id);
  
  return convertToCalendarEvent(updated, calendarId);
}

/**
 * Delete an event
 * 
 * @param calendarId - Calendar ID
 * @param eventId - Event ID to delete
 */
export async function deleteEvent(
  eventId: string,
  calendarId: string = 'primary'
): Promise<void> {
  const response = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
    }
  );
  
  // 204 No Content is success for DELETE
  if (!response.ok && response.status !== 204) {
    await handleApiError(response);
  }
  
  console.log('[Ambient] Event deleted');
}

/**
 * Get a single event by ID
 */
export async function getEvent(
  eventId: string,
  calendarId: string = 'primary'
): Promise<CalendarEvent> {
  const response = await calendarFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
  );
  
  if (!response.ok) {
    await handleApiError(response);
  }
  
  const event: GoogleCalendarEvent = await response.json();
  return convertToCalendarEvent(event, calendarId);
}

// ============ Helper Functions ============

/**
 * Convert Google Calendar API event to our CalendarEvent type
 */
function convertToCalendarEvent(event: GoogleCalendarEvent, calendarId: string): CalendarEvent {
  return {
    id: event.id,
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: event.start,
    end: event.end,
    htmlLink: event.htmlLink,
    attendees: event.attendees?.map(a => ({
      email: a.email,
      responseStatus: a.responseStatus,
    })),
    calendarName: calendarId,
    recurringEventId: event.recurringEventId,
  };
}

/**
 * Convert our CalendarEvent type to Google Calendar API format
 */
function convertToGoogleEvent(event: Partial<CalendarEvent>): Partial<GoogleCalendarEvent> {
  const googleEvent: Partial<GoogleCalendarEvent> = {};
  
  if (event.summary !== undefined) googleEvent.summary = event.summary;
  if (event.description !== undefined) googleEvent.description = event.description;
  if (event.location !== undefined) googleEvent.location = event.location;
  
  // Normalize start/end dates to ensure they're compatible with Google Calendar API
  const { start, end } = normalizeEventDates(event.start, event.end);
  if (start) googleEvent.start = start;
  if (end) googleEvent.end = end;
  
  if (event.attendees) {
    googleEvent.attendees = event.attendees.map(a => ({
      email: a.email,
      responseStatus: a.responseStatus,
    }));
  }
  
  return googleEvent;
}

/**
 * Normalize event start/end dates to ensure Google Calendar API compatibility
 * 
 * Rules:
 * 1. Start and end must both be either 'date' (all-day) or 'dateTime' (specific time)
 * 2. If end is missing, default to +1 hour (for dateTime) or same date (for date)
 * 3. Remove conflicting fields (can't have both date and dateTime)
 * 4. Clean up null/empty values
 */
function normalizeEventDates(
  start?: DateTimeInfo,
  end?: DateTimeInfo
): { start?: DateTimeInfo; end?: DateTimeInfo } {
  if (!start) {
    console.log('[Ambient] normalizeEventDates: No start date provided');
    return { start: undefined, end: undefined };
  }

  const normalizedStart: DateTimeInfo = { ...start };
  let normalizedEnd: DateTimeInfo = end ? { ...end } : {};

  // Clean up empty string values
  if (normalizedStart.date === '' || normalizedStart.date === 'null') delete normalizedStart.date;
  if (normalizedStart.dateTime === '' || normalizedStart.dateTime === 'null') delete normalizedStart.dateTime;
  if (normalizedEnd.date === '' || normalizedEnd.date === 'null') delete normalizedEnd.date;
  if (normalizedEnd.dateTime === '' || normalizedEnd.dateTime === 'null') delete normalizedEnd.dateTime;

  // Case 1: Start has dateTime (specific time event)
  if (normalizedStart.dateTime) {
    console.log('[Ambient] normalizeEventDates: Processing dateTime event');
    
    // Remove conflicting date field from start
    delete normalizedStart.date;
    
    // Ensure end has dateTime
    if (!normalizedEnd.dateTime) {
      try {
        const startDate = new Date(normalizedStart.dateTime);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1 hour
        normalizedEnd.dateTime = endDate.toISOString();
        console.log('[Ambient] normalizeEventDates: Generated end dateTime:', normalizedEnd.dateTime);
      } catch (e) {
        console.error('[Ambient] normalizeEventDates: Error generating end dateTime:', e);
      }
    }
    
    // Remove conflicting date field from end
    delete normalizedEnd.date;
    
    // Copy timezone from start if end doesn't have one
    if (normalizedStart.timeZone && !normalizedEnd.timeZone) {
      normalizedEnd.timeZone = normalizedStart.timeZone;
    }
  }
  // Case 2: Start has date (all-day event)
  else if (normalizedStart.date) {
    console.log('[Ambient] normalizeEventDates: Processing all-day event');
    
    // Parse human-readable date if needed
    normalizedStart.date = normalizeDateFormat(normalizedStart.date);
    
    // Ensure end has date - use same date as start (Google Calendar API accepts this)
    if (!normalizedEnd.date) {
      normalizedEnd.date = normalizedStart.date;
      console.log('[Ambient] normalizeEventDates: Using same date for end:', normalizedEnd.date);
    } else {
      normalizedEnd.date = normalizeDateFormat(normalizedEnd.date);
    }
    
    // Remove conflicting dateTime and timeZone fields
    delete normalizedStart.dateTime;
    delete normalizedEnd.dateTime;
    delete normalizedStart.timeZone;
    delete normalizedEnd.timeZone;
  }

  console.log('[Ambient] normalizeEventDates result:', { start: normalizedStart, end: normalizedEnd });
  
  return { start: normalizedStart, end: normalizedEnd };
}

/**
 * Normalize date format to YYYY-MM-DD
 * Handles various input formats like "January 17, 2026" or "2026-01-17"
 */
function normalizeDateFormat(dateStr: string): string {
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch (e) {
    console.error('[Ambient] normalizeDateFormat: Could not parse date:', dateStr);
  }
  
  return dateStr; // Return as-is if we can't parse
}

/**
 * Handle API errors with user-friendly messages
 * 
 * Best Practice: Convert HTTP status codes to actionable error messages.
 */
async function handleApiError(response: Response): Promise<never> {
  let errorMessage = `Calendar API error: ${response.status}`;
  let errorCode: string | undefined;
  
  try {
    const errorData = await response.json();
    if (errorData.error?.message) {
      errorMessage = errorData.error.message;
    }
    if (errorData.error?.code) {
      errorCode = errorData.error.code;
    }
  } catch {
    // Could not parse error response
  }
  
  switch (response.status) {
    case 401:
      throw new CalendarApiError('Calendar authentication expired. Please reconnect.', 401);
    case 403:
      throw new CalendarApiError('Permission denied. Please reconnect your calendar.', 403);
    case 404:
      throw new CalendarApiError('Calendar or event not found.', 404);
    case 429:
      throw new CalendarApiError('Too many requests. Please wait a moment and try again.', 429);
    case 500:
    case 502:
    case 503:
      throw new CalendarApiError('Google Calendar is temporarily unavailable. Try again later.', response.status);
    default:
      throw new CalendarApiError(errorMessage, response.status, errorCode);
  }
}

/**
 * Helper to create date range for fetching events
 * 
 * @param daysBack - Number of days in the past
 * @param daysForward - Number of days in the future
 */
export function getDateRange(daysBack: number = 7, daysForward: number = 30): {
  timeMin: string;
  timeMax: string;
} {
  const now = new Date();
  
  const timeMin = new Date(now);
  timeMin.setDate(timeMin.getDate() - daysBack);
  timeMin.setHours(0, 0, 0, 0);
  
  const timeMax = new Date(now);
  timeMax.setDate(timeMax.getDate() + daysForward);
  timeMax.setHours(23, 59, 59, 999);
  
  return {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
  };
}
