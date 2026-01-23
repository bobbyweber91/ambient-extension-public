/**
 * Embedding-based similarity matching for pre-filtering calendar events
 * Uses Google's text-embedding-004 model
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { CalendarEvent, ExtractedEvent, EmbeddingMatch, ExtractedEventWithMatches } from '../../types';

const EMBEDDING_MODEL = 'text-embedding-004';
const SIMILARITY_THRESHOLD = 0.75;

/**
 * Get embeddings for a list of texts using Google's embedding model
 */
export async function getEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });

  try {
    // Embed each text separately (API doesn't support batch embedding with complex objects)
    const embeddings: number[][] = [];
    
    for (const text of texts) {
      const result = await model.embedContent(text);
      if (result.embedding?.values) {
        embeddings.push(result.embedding.values);
      }
    }
    
    return embeddings;
  } catch (error) {
    console.error('Error getting embeddings:', error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Extract summaries and descriptions from calendar events
 */
function getCalendarTexts(calendarEvents: CalendarEvent[]): { summaries: string[]; descriptions: string[]; eventMap: Map<string, CalendarEvent> } {
  const summaries: string[] = [];
  const descriptions: string[] = [];
  const eventMap = new Map<string, CalendarEvent>();

  for (const event of calendarEvents) {
    if (event.summary) {
      summaries.push(event.summary);
      eventMap.set(event.summary, event);
    }
    if (event.description) {
      descriptions.push(event.description);
      eventMap.set(event.description, event);
    }
  }

  return { summaries, descriptions, eventMap };
}

/**
 * Extract summaries and descriptions from extracted events
 */
function getTextEventTexts(extractedEvents: ExtractedEvent[]): { summaries: string[]; descriptions: string[] } {
  const summaries: string[] = [];
  const descriptions: string[] = [];

  for (const event of extractedEvents) {
    if (event.event_type === 'not_an_event') {
      continue;
    }
    if (event.summary) {
      summaries.push(event.summary);
    }
    if (event.description) {
      descriptions.push(event.description);
    }
  }

  return { summaries, descriptions };
}

/**
 * Find matches above threshold between two sets of embeddings
 */
function findMatches(
  calendarTexts: string[],
  calendarEmbeddings: number[][],
  textEventTexts: string[],
  textEventEmbeddings: number[][],
  threshold: number
): EmbeddingMatch[] {
  const matches: EmbeddingMatch[] = [];

  for (let i = 0; i < calendarEmbeddings.length; i++) {
    for (let j = 0; j < textEventEmbeddings.length; j++) {
      const similarity = cosineSimilarity(calendarEmbeddings[i], textEventEmbeddings[j]);
      if (similarity >= threshold) {
        matches.push({
          calendarEventId: '', // Will be filled in by caller
          calendarText: calendarTexts[i],
          textEventText: textEventTexts[j],
          similarity,
        });
      }
    }
  }

  return matches;
}

/**
 * Main function: Find potential calendar matches for each extracted event
 * Returns extracted events with potentialCalendarMatches populated
 */
export async function findPotentialMatches(
  calendarEvents: CalendarEvent[],
  extractedEvents: ExtractedEvent[],
  apiKey: string,
  threshold: number = SIMILARITY_THRESHOLD
): Promise<ExtractedEventWithMatches[]> {
  console.log('Finding potential matches using embeddings...');
  console.log(`Calendar events: ${calendarEvents.length}, Extracted events: ${extractedEvents.length}`);

  // Filter to only actionable extracted events
  const actionableEvents = extractedEvents.filter(
    e => e.event_type !== 'not_an_event'
  );

  if (actionableEvents.length === 0 || calendarEvents.length === 0) {
    console.log('No events to match');
    return extractedEvents.map(e => ({ ...e, potentialCalendarMatches: [] }));
  }

  // Extract texts
  const { summaries: calSummaries, descriptions: calDescriptions, eventMap } = getCalendarTexts(calendarEvents);
  const { summaries: textSummaries, descriptions: textDescriptions } = getTextEventTexts(actionableEvents);

  console.log(`Calendar: ${calSummaries.length} summaries, ${calDescriptions.length} descriptions`);
  console.log(`Text events: ${textSummaries.length} summaries, ${textDescriptions.length} descriptions`);

  // Get all embeddings in batches
  const allCalendarTexts = [...calSummaries, ...calDescriptions];
  const allTextEventTexts = [...textSummaries, ...textDescriptions];

  if (allCalendarTexts.length === 0 || allTextEventTexts.length === 0) {
    console.log('No texts to embed');
    return extractedEvents.map(e => ({ ...e, potentialCalendarMatches: [] }));
  }

  console.log('Getting embeddings...');
  const [calendarEmbeddings, textEventEmbeddings] = await Promise.all([
    getEmbeddings(allCalendarTexts, apiKey),
    getEmbeddings(allTextEventTexts, apiKey),
  ]);

  console.log(`Got ${calendarEmbeddings.length} calendar embeddings, ${textEventEmbeddings.length} text event embeddings`);

  // Find all matches above threshold
  const matches = findMatches(
    allCalendarTexts,
    calendarEmbeddings,
    allTextEventTexts,
    textEventEmbeddings,
    threshold
  );

  console.log(`Found ${matches.length} embedding matches above threshold ${threshold}`);

  // Map matches back to extracted events
  const eventsWithMatches: ExtractedEventWithMatches[] = extractedEvents.map(event => {
    if (event.event_type === 'not_an_event') {
      return { ...event, potentialCalendarMatches: [] };
    }

    const potentialMatches = new Set<string>();

    for (const match of matches) {
      // Check if this match is for this event
      if (
        (event.summary && match.textEventText === event.summary) ||
        (event.description && match.textEventText === event.description)
      ) {
        potentialMatches.add(match.calendarText);
      }
    }

    return {
      ...event,
      potentialCalendarMatches: Array.from(potentialMatches),
    };
  });

  // Log summary
  const withMatches = eventsWithMatches.filter(e => e.potentialCalendarMatches && e.potentialCalendarMatches.length > 0);
  console.log(`${withMatches.length} extracted events have potential calendar matches`);

  return eventsWithMatches;
}

/**
 * Get calendar events that match a specific extracted event's potential matches
 */
export function getMatchingCalendarEvents(
  event: ExtractedEventWithMatches,
  calendarEvents: CalendarEvent[]
): CalendarEvent[] {
  if (!event.potentialCalendarMatches || event.potentialCalendarMatches.length === 0) {
    return [];
  }

  const matchingEvents: CalendarEvent[] = [];
  
  for (const calEvent of calendarEvents) {
    for (const potentialMatch of event.potentialCalendarMatches) {
      if (calEvent.summary === potentialMatch || calEvent.description === potentialMatch) {
        if (!matchingEvents.includes(calEvent)) {
          matchingEvents.push(calEvent);
        }
      }
    }
  }

  return matchingEvents;
}
