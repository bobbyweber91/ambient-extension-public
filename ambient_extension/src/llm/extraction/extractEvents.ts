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
