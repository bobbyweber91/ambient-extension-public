/**
 * Core type definitions for the Ambient Extension
 */

// Message structure extracted from Google Messages DOM
export interface StructuredMessage {
  date: string;           // ISO 8601 format: "2026-01-15T17:53:01-08:00"
  sender: string;         // "You" or contact name
  text: string;
}

// Conversation data structure
// Note: user_name_in_conversation not available from DOM
export interface ConversationDict {
  title: string;          // Conversation title from header
  participants?: string[]; // Derived from unique senders (excluding "You")
  structured_messages: StructuredMessage[];
}

// Event details extracted from URLs
export interface EventDetails {
  event_type?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: DateTimeInfo;
  end?: DateTimeInfo;
  attendees?: string;
  htmlLink?: string;
}

// Date/time info for events
export interface DateTimeInfo {
  date?: string;      // YYYY-MM-DD format
  dateTime?: string;  // ISO 8601 format
  timeZone?: string;
}

// Event types from LLM extraction
export type EventType = 
  | 'full_potential_event_details'
  | 'incomplete_event_details'
  | 'not_a_desired_event'
  | 'not_an_event';

// Extracted event from LLM
export interface ExtractedEvent {
  event_type: EventType;
  summary: string;
  description: string;
  location?: string;
  start?: DateTimeInfo;
  end?: DateTimeInfo;
  attendees?: string;
  htmlLink?: string;
  user_confirmed_attendance?: boolean;
  reference_messages?: Array<{
    sender: string;
    text: string;
    date: string;
    sender_nickname?: string;
    event_details?: EventDetails[];
  }>;
}

// Google Calendar event structure
export interface CalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: DateTimeInfo;
  end?: DateTimeInfo;
  htmlLink?: string;
  attendees?: Array<{ email: string; responseStatus?: string }>;
  calendarName?: string;
  recurringEventId?: string; // Present if this is an instance of a recurring event
}

// Match types for calendar matching
export type MatchType = 
  | 'no_match'
  | 'no_update'
  | 'certain_update'
  | 'possible_update'
  | 'removal';

// Match data from LLM response
export interface MatchData {
  match_type: MatchType;
  matched_event: string | null;      // Calendar event summary if matched
  matched_event_id: string | null;   // Calendar event ID if matched
}

// Full match update response from LLM
export interface MatchUpdate {
  match_data: MatchData;
  summary?: string;
  description?: string;
  location?: string;
  start?: DateTimeInfo;
  end?: DateTimeInfo;
  htmlLink?: string;
}

// Embedding match result for pre-filtering
export interface EmbeddingMatch {
  calendarEventId: string;
  calendarText: string;      // Summary or description that matched
  textEventText: string;     // Summary or description from extracted event
  similarity: number;
}

// Extracted event with potential calendar matches (after embedding filtering)
export interface ExtractedEventWithMatches extends ExtractedEvent {
  potentialCalendarMatches?: string[];  // Calendar event summaries/descriptions that might match
}

// Match result from calendar comparison
export interface MatchResult {
  extracted_event: ExtractedEvent;
  match_type: MatchType;
  match_data: MatchData;
  matched_calendar_event?: CalendarEvent;
  suggested_updates?: Partial<CalendarEvent>;
  field_differences?: FieldDifferences;
}

// Field differences for display
export interface FieldDifferences {
  summary?: { old: string; new: string };
  description?: { old: string; new: string };
  location?: { old: string; new: string };
  start?: { old: DateTimeInfo; new: DateTimeInfo };
  end?: { old: DateTimeInfo; new: DateTimeInfo };
}

// Extension status for UI
export type ExtensionStatus = 
  | 'idle'
  | 'parsing'
  | 'scrolling'
  | 'extracting'
  | 'fetching_calendar'
  | 'matching'
  | 'updating'
  | 'complete'
  | 'error';

// Message types for communication between components
export interface ExtractEventsMessage {
  type: 'EXTRACT_EVENTS';
  conversation: ConversationDict;
  apiKey: string;
  userName: string;
}

export interface MatchEventsMessage {
  type: 'MATCH_EVENTS';
  extractedEvents: ExtractedEvent[];
  calendarEvents: CalendarEvent[];
  apiKey: string;
}

export interface ParseDOMMessage {
  type: 'PARSE_DOM';
}

export interface ScrollMessage {
  type: 'SCROLL_CONVERSATION';
  untilDate?: string;
  maxMessages?: number;
}

export interface ScrollBackDaysMessage {
  type: 'SCROLL_BACK_DAYS';
  days: number;
}

export interface ScrollBackDaysResponse {
  success: boolean;
  error?: string;
  reachedTarget?: boolean;
  oldestMessageDate?: string;
}