/**
 * Event extraction using Gemini API
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ConversationDict, ExtractedEvent } from '../../types';
import { generateEventExtractionPrompt } from './instructions';

/**
 * Extract events from a conversation using Gemini
 */
export async function extractEvents(
  conversation: ConversationDict,
  apiKey: string,
  userRealName: string
): Promise<ExtractedEvent[]> {
  console.log('Starting event extraction for conversation:', conversation.title);
  console.log('User name:', userRealName);
  console.log('Message count:', conversation.structured_messages.length);

  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash-exp',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  // Generate the prompt
  const prompt = generateEventExtractionPrompt(conversation, userRealName);
  console.log('Prompt length:', prompt.length, 'characters');

  // Call Gemini API
  console.log('Calling Gemini API...');
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });

  const response = result.response;
  const responseText = response.text();
  console.log('Received response, length:', responseText.length);

  // Parse the response
  const events = parseExtractedEvents(responseText);
  console.log('Parsed', events.length, 'events');

  return events;
}

/**
 * Parse and validate the LLM response
 */
export function parseExtractedEvents(responseText: string): ExtractedEvent[] {
  try {
    // Clean up response - sometimes wrapped in markdown code blocks
    let cleanedText = responseText.trim();
    
    // Remove markdown code block if present
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
    
    if (Array.isArray(parsed)) {
      return parsed as ExtractedEvent[];
    }
    
    // Single event wrapped in object
    return [parsed as ExtractedEvent];
  } catch (error) {
    console.error('Failed to parse LLM response:', error);
    console.error('Response text:', responseText.substring(0, 500));
    throw new Error(`Failed to parse LLM response: ${error}`);
  }
}

/**
 * Filter to only include actionable events (not "not_an_event")
 */
export function filterActionableEvents(events: ExtractedEvent[]): ExtractedEvent[] {
  return events.filter(event => 
    event.event_type !== 'not_an_event'
  );
}

const FILE_EXTRACTION_PROMPT = `Extract all calendar events from this document. Return a JSON array where each event has this exact structure:

{
  "event_type": "full_potential_event_details",
  "summary": "<event title>",
  "description": "<any remaining description, color codes, notes, category info, etc.>",
  "location": "<location if mentioned, otherwise null>",
  "start": { "date": "YYYY-MM-DD" },
  "end": { "date": "YYYY-MM-DD" }
}

Rules:
- For all-day events, use "date" in "YYYY-MM-DD" format for start and end.
- For timed events, use "dateTime" in ISO 8601 format (e.g. "2026-03-15T09:00:00") and include "timeZone" (e.g. "America/New_York") instead of "date".
- If the end date/time is not specified, set end equal to start.
- Set event_type to "full_potential_event_details" for all events.
- If a legend or guide is provided (e.g. blue = all day event, yellow = makeup day, red = no school), use it to enhance the description field of each relevant event.
- Include every event you can find in the document, even if some details are incomplete.
- Return ONLY the JSON array, no other text.`;

/**
 * Extract events from an uploaded file using Gemini multimodal API
 */
export async function extractEventsFromFile(
  fileBase64: string,
  mimeType: string,
  apiKey: string
): Promise<ExtractedEvent[]> {
  console.log('Starting file event extraction, mimeType:', mimeType);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  console.log('Calling Gemini API with file...');
  const result = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType, data: fileBase64 } },
        { text: FILE_EXTRACTION_PROMPT },
      ],
    }],
  });

  const response = result.response;
  const responseText = response.text();
  console.log('Received file extraction response, length:', responseText.length);

  const events = parseExtractedEvents(responseText);
  console.log('Parsed', events.length, 'events from file');

  return events;
}
