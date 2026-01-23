/**
 * Calendar event matching using Gemini API
 * Ported from ambient_v1 matches/main.py
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { 
  ExtractedEvent, 
  CalendarEvent, 
  MatchResult, 
  MatchUpdate, 
  MatchData,
  ExtractedEventWithMatches 
} from '../../types';
import { generateMatchInstructions } from './instructions';
import { findPotentialMatches, getMatchingCalendarEvents } from './embeddingSimilarity';
import { determineDifferences } from './fieldDiff';

/**
 * Match a single text event against calendar events using LLM
 */
export async function matchEventToCalendar(
  textEvent: ExtractedEvent,
  calendarEvents: CalendarEvent[],
  apiKey: string
): Promise<MatchUpdate> {
  console.log('Matching event:', textEvent.summary);
  console.log('Against', calendarEvents.length, 'calendar events');

  // Generate the match prompt
  const prompt = generateMatchInstructions(textEvent, calendarEvents);

  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  // Call LLM with retries
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      response = result.response;
      
      // Check for error responses
      const responseText = response.text();
      if (responseText.includes('500 INTERNAL') || responseText.includes('503 UNAVAILABLE')) {
        console.warn(`Gemini error on attempt ${attempt + 1}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
        continue;
      }
      
      break;
    } catch (error: any) {
      const errorMsg = error.message || '';
      if (errorMsg.includes('500') || errorMsg.includes('503') || errorMsg.includes('UNAVAILABLE')) {
        console.warn(`Gemini API error on attempt ${attempt + 1}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
        if (attempt === 2) {
          throw new Error(`Gemini error after 3 attempts: ${errorMsg}`);
        }
      } else {
        throw error;
      }
    }
  }

  if (!response) {
    throw new Error('Failed to get response from Gemini');
  }

  // Parse the response
  const responseText = response.text();
  const matchUpdate = parseMatchResponse(responseText);
  
  console.log('Match result:', matchUpdate.match_data.match_type);
  
  return matchUpdate;
}

/**
 * Parse the LLM match response into a MatchUpdate object
 */
function parseMatchResponse(responseText: string): MatchUpdate {
  try {
    // Clean up response - sometimes wrapped in markdown code blocks
    let cleanedText = responseText.trim();
    
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.slice(7);
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.slice(3);
    }
    if (cleanedText.endsWith('```')) {
      cleanedText = cleanedText.slice(0, -3);
    }
    cleanedText = cleanedText.trim();

    const parsed = JSON.parse(cleanedText);
    
    // Ensure match_data exists
    if (!parsed.match_data) {
      throw new Error('Response missing match_data');
    }

    // Normalize match_type
    const matchType = parsed.match_data.match_type?.toLowerCase() || 'no_match';
    
    return {
      match_data: {
        match_type: matchType as MatchUpdate['match_data']['match_type'],
        matched_event: parsed.match_data.matched_event || null,
        matched_event_id: parsed.match_data.matched_event_id || null,
      },
      summary: parsed.summary,
      description: parsed.description,
      location: parsed.location,
      start: parsed.start,
      end: parsed.end,
      htmlLink: parsed.htmlLink,
    };
  } catch (error) {
    console.error('Failed to parse match response:', error);
    console.error('Response text:', responseText.substring(0, 500));
    
    // Return a no_match as fallback
    return {
      match_data: {
        match_type: 'no_match',
        matched_event: null,
        matched_event_id: null,
      },
    };
  }
}

/**
 * Apply match update to create a MatchResult
 */
function applyMatchUpdate(
  textEvent: ExtractedEvent,
  calendarEvents: CalendarEvent[],
  matchUpdate: MatchUpdate
): MatchResult {
  const { match_data } = matchUpdate;

  // Find the matching calendar event if applicable
  let matchedCalendarEvent: CalendarEvent | undefined;
  if (match_data.matched_event_id) {
    matchedCalendarEvent = calendarEvents.find(e => e.id === match_data.matched_event_id);
  }

  // Compute suggested updates (only fields that changed)
  let suggestedUpdates: Partial<CalendarEvent> | undefined;
  let fieldDifferences;

  if (matchedCalendarEvent && (match_data.match_type === 'certain_update' || match_data.match_type === 'possible_update')) {
    suggestedUpdates = {};
    
    if (matchUpdate.summary) suggestedUpdates.summary = matchUpdate.summary;
    if (matchUpdate.description) suggestedUpdates.description = matchUpdate.description;
    if (matchUpdate.location) suggestedUpdates.location = matchUpdate.location;
    if (matchUpdate.start) suggestedUpdates.start = matchUpdate.start;
    if (matchUpdate.end) suggestedUpdates.end = matchUpdate.end;
    if (matchUpdate.htmlLink) suggestedUpdates.htmlLink = matchUpdate.htmlLink;

    // Compute field differences for display
    fieldDifferences = determineDifferences(matchedCalendarEvent, {
      ...matchedCalendarEvent,
      ...suggestedUpdates,
    });
  }

  return {
    extracted_event: textEvent,
    match_type: match_data.match_type,
    match_data,
    matched_calendar_event: matchedCalendarEvent,
    suggested_updates: suggestedUpdates,
    field_differences: fieldDifferences,
  };
}

/**
 * Match all extracted events against calendar events
 * Uses embedding similarity for pre-filtering to reduce LLM calls
 */
export async function matchAllEventsToCalendar(
  extractedEvents: ExtractedEvent[],
  calendarEvents: CalendarEvent[],
  apiKey: string
): Promise<MatchResult[]> {
  console.log('Starting calendar matching...');
  console.log(`Extracted events: ${extractedEvents.length}, Calendar events: ${calendarEvents.length}`);

  // Filter to only processable events
  const processableEvents = extractedEvents.filter(
    e => e.event_type === 'full_potential_event_details' || 
         e.event_type === 'incomplete_event_details' ||
         e.event_type === 'not_a_desired_event'
  );

  console.log(`Processable events: ${processableEvents.length}`);

  if (processableEvents.length === 0) {
    console.log('No events to match');
    return [];
  }

  // Use embedding similarity to find potential matches
  let eventsWithMatches: ExtractedEventWithMatches[];
  try {
    eventsWithMatches = await findPotentialMatches(calendarEvents, processableEvents, apiKey);
  } catch (error) {
    console.error('Embedding matching failed, falling back to matching all events:', error);
    // Fallback: treat all calendar events as potential matches
    eventsWithMatches = processableEvents.map(e => ({
      ...e,
      potentialCalendarMatches: calendarEvents.map(c => c.summary || '').filter(s => s),
    }));
  }

  // Match each event
  const matchResults: MatchResult[] = [];

  for (const event of eventsWithMatches) {
    console.log(`Processing event: ${event.summary}`);

    // Get calendar events that might match this text event
    const potentialCalendarEvents = getMatchingCalendarEvents(event, calendarEvents);

    if (potentialCalendarEvents.length > 0) {
      console.log(`Found ${potentialCalendarEvents.length} potential calendar matches`);
      
      // Call LLM to determine match
      try {
        const matchUpdate = await matchEventToCalendar(event, potentialCalendarEvents, apiKey);
        const matchResult = applyMatchUpdate(event, potentialCalendarEvents, matchUpdate);
        matchResults.push(matchResult);
      } catch (error) {
        console.error(`Error matching event ${event.summary}:`, error);
        // Add as no_match on error
        matchResults.push({
          extracted_event: event,
          match_type: 'no_match',
          match_data: {
            match_type: 'no_match',
            matched_event: null,
            matched_event_id: null,
          },
        });
      }
    } else {
      console.log('No potential calendar matches found, marking as no_match');
      // No potential matches - this is a new event
      matchResults.push({
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

  console.log(`Matching complete. Results: ${matchResults.length}`);
  
  // Log summary
  const byType = {
    no_match: matchResults.filter(r => r.match_type === 'no_match').length,
    no_update: matchResults.filter(r => r.match_type === 'no_update').length,
    certain_update: matchResults.filter(r => r.match_type === 'certain_update').length,
    possible_update: matchResults.filter(r => r.match_type === 'possible_update').length,
  };
  console.log('Match summary:', byType);

  return matchResults;
}
