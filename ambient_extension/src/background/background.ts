/**
 * Background service worker for the Ambient Extension
 * Handles long-running tasks like LLM API calls
 * 
 * Supports two AI providers:
 * - 'gemini_key': User's own Gemini API key (direct calls)
 * - 'ambient_ai': AmbientAI's paid tier via Django server
 */

import { extractEvents, extractEventsFromFile } from '../llm/extraction';
import { matchAllEventsToCalendar } from '../llm/matching';
import { extractEventsViaAmbient, extractEventsFromFileViaAmbient, matchEventViaAmbient, checkAmbientProfile } from '../lib/ambientApi';
import { getAIProvider, type AIProvider } from '../lib/storage';
import type { ConversationDict, ExtractedEvent, CalendarEvent, MatchResult, MatchUpdate } from '../types';

// Enable side panel on extension icon click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Failed to set panel behavior:', error));

// Listen for messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);

  switch (message.type) {
    case 'EXTRACT_EVENTS':
      handleExtractEvents(message)
        .then((result) => sendResponse({ success: true, events: result.events, isAmbientUser: result.isAmbientUser }))
        .catch((error) => {
          console.error('Extract events error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep channel open for async response

    case 'EXTRACT_FROM_FILE':
      handleExtractFromFile(message)
        .then((result) => sendResponse({ success: true, events: result.events, isAmbientUser: result.isAmbientUser }))
        .catch((error) => {
          console.error('Extract from file error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'MATCH_EVENTS':
      handleMatchEvents(message)
        .then((result) => sendResponse({ success: true, matches: result }))
        .catch((error) => {
          console.error('Match events error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'CREATE_CALENDAR_EVENT':
      handleCreateCalendarEvent(message)
        .then((result) => sendResponse({ success: true, event: result }))
        .catch((error) => {
          console.error('Create calendar event error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'UPDATE_CALENDAR_EVENT':
      handleUpdateCalendarEvent(message)
        .then((result) => sendResponse({ success: true, event: result }))
        .catch((error) => {
          console.error('Update calendar event error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case 'CHECK_PROFILE':
      handleCheckProfile()
        .then((result) => sendResponse({ success: true, isAmbientUser: result.isAmbientUser, email: result.email }))
        .catch((error) => {
          console.error('Check profile error:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    default:
      console.warn('Unknown message type:', message.type);
      return false;
  }
});

interface ExtractEventsMessage {
  type: 'EXTRACT_EVENTS';
  conversation: ConversationDict;
  apiKey: string;  // Only used when provider is 'gemini_key'
  userName: string;
  provider?: AIProvider;  // Optional, will fetch from storage if not provided
}

interface MatchEventsMessage {
  type: 'MATCH_EVENTS';
  extractedEvents: ExtractedEvent[];
  calendarEvents: CalendarEvent[];
  apiKey: string;  // Only used when provider is 'gemini_key'
  provider?: AIProvider;  // Optional, will fetch from storage if not provided
}

interface CreateCalendarEventMessage {
  type: 'CREATE_CALENDAR_EVENT';
  event: Partial<CalendarEvent>;
}

interface UpdateCalendarEventMessage {
  type: 'UPDATE_CALENDAR_EVENT';
  eventId: string;
  calendarId: string;
  updates: Partial<CalendarEvent>;
}

interface ExtractFromFileMessage {
  type: 'EXTRACT_FROM_FILE';
  fileBase64: string;
  mimeType: string;
  fileName: string;
  apiKey: string;
  provider?: AIProvider;
}

interface ExtractEventsResult {
  events: ExtractedEvent[];
  isAmbientUser?: boolean;
}

async function handleExtractFromFile(message: ExtractFromFileMessage): Promise<ExtractEventsResult> {
  console.log('Extract from file called:', message.fileName);

  if (!message.fileBase64) {
    throw new Error('No file data provided');
  }

  const provider = message.provider || await getAIProvider();
  console.log(`[Ambient] Using AI provider for file extraction: ${provider}`);

  if (provider === 'ambient_ai') {
    const result = await extractEventsFromFileViaAmbient(
      message.fileBase64,
      message.mimeType,
      message.fileName
    );
    return { events: result.events, isAmbientUser: result.isAmbientUser };
  } else {
    if (!message.apiKey) {
      throw new Error('No API key provided for Gemini key provider');
    }
    const events = await extractEventsFromFile(
      message.fileBase64,
      message.mimeType,
      message.apiKey
    );
    return { events };
  }
}

async function handleExtractEvents(message: ExtractEventsMessage): Promise<ExtractEventsResult> {
  console.log('Extract events called with conversation:', message.conversation?.title);
  
  if (!message.conversation) {
    throw new Error('No conversation provided');
  }
  if (!message.userName) {
    throw new Error('No user name provided');
  }

  // Get the AI provider (from message or storage)
  const provider = message.provider || await getAIProvider();
  console.log(`[Ambient] Using AI provider: ${provider}`);

  if (provider === 'ambient_ai') {
    // Use AmbientAI's paid tier via Django server
    const result = await extractEventsViaAmbient(
      message.conversation,
      message.userName
    );
    return {
      events: result.events,
      isAmbientUser: result.isAmbientUser
    };
  } else {
    // Use user's own Gemini API key (direct calls)
    if (!message.apiKey) {
      throw new Error('No API key provided for Gemini key provider');
    }
    
    const events = await extractEvents(
      message.conversation,
      message.apiKey,
      message.userName
    );
    // No ambient user info when using own API key
    return { events };
  }
}

async function handleMatchEvents(message: MatchEventsMessage): Promise<MatchResult[]> {
  console.log('Match events called');
  console.log(`Extracted events: ${message.extractedEvents?.length || 0}`);
  console.log(`Calendar events: ${message.calendarEvents?.length || 0}`);
  
  if (!message.extractedEvents || message.extractedEvents.length === 0) {
    throw new Error('No extracted events provided');
  }

  // Calendar events might be empty if user has no events in range
  const calendarEvents = message.calendarEvents || [];

  // Get the AI provider (from message or storage)
  const provider = message.provider || await getAIProvider();
  console.log(`[Ambient] Using AI provider for matching: ${provider}`);

  if (provider === 'ambient_ai') {
    // Use AmbientAI's paid tier via Django server
    // Process each event individually through the API
    const matches: MatchResult[] = [];
    
    for (const event of message.extractedEvents) {
      // Skip non-processable events
      if (event.event_type !== 'full_potential_event_details' && 
          event.event_type !== 'incomplete_event_details') {
        continue;
      }

      try {
        const matchResponse = await matchEventViaAmbient(event, calendarEvents);
        const matchUpdate = matchResponse.matchResult;
        
        // Convert MatchUpdate to MatchResult format
        const matchResult: MatchResult = {
          extracted_event: event,
          match_type: matchUpdate.match_data.match_type,
          match_data: matchUpdate.match_data,
          matched_calendar_event: matchUpdate.match_data.matched_event_id 
            ? calendarEvents.find(ce => ce.id === matchUpdate.match_data.matched_event_id)
            : undefined,
          suggested_updates: {
            summary: matchUpdate.summary,
            description: matchUpdate.description,
            location: matchUpdate.location,
            start: matchUpdate.start,
            end: matchUpdate.end,
            htmlLink: matchUpdate.htmlLink,
          },
        };
        
        matches.push(matchResult);
      } catch (error) {
        console.error(`[Ambient] Error matching event "${event.summary}":`, error);
        // Add as no_match on error
        matches.push({
          extracted_event: event,
          match_type: 'no_match',
          match_data: {
            match_type: 'no_match',
            matched_event: null,
            matched_event_id: null,
          },
        });
      }
    }
    
    return matches;
  } else {
    // Use user's own Gemini API key (direct calls)
    if (!message.apiKey) {
      throw new Error('No API key provided for Gemini key provider');
    }

    const matches = await matchAllEventsToCalendar(
      message.extractedEvents,
      calendarEvents,
      message.apiKey
    );

    return matches;
  }
}

async function handleCreateCalendarEvent(message: CreateCalendarEventMessage): Promise<CalendarEvent> {
  console.log('Create calendar event called:', message.event?.summary);
  
  if (!message.event) {
    throw new Error('No event data provided');
  }

  // This will be called from the sidepanel which has access to calendarApi
  // The actual creation is handled there - this is just for logging/forwarding
  throw new Error('Calendar creation should be handled in sidepanel with calendarApi');
}

async function handleUpdateCalendarEvent(message: UpdateCalendarEventMessage): Promise<CalendarEvent> {
  console.log('Update calendar event called:', message.eventId);
  
  if (!message.eventId) {
    throw new Error('No event ID provided');
  }
  if (!message.updates) {
    throw new Error('No updates provided');
  }

  // This will be called from the sidepanel which has access to calendarApi
  throw new Error('Calendar update should be handled in sidepanel with calendarApi');
}

interface CheckProfileResult {
  isAmbientUser: boolean;
  email: string;
}

async function handleCheckProfile(): Promise<CheckProfileResult> {
  console.log('Check profile called');
  
  const result = await checkAmbientProfile();
  console.log(`[Ambient] Profile check: email=${result.email}, isAmbientUser=${result.isAmbientUser}`);
  
  return result;
}

console.log('Ambient Extension background service worker loaded');
