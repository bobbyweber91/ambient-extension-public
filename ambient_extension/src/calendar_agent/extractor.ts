/**
 * Extractor Agent — parses content (DOM HTML, ICS, or JSON) into ExtractedEvent objects.
 * Does NOT decide strategy or navigate. Only extracts and returns structured events.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCalendarToken } from '../lib/calendarAuth';
import type { ExtractedEvent } from '../types';
import type { ExtractionResult } from './types';
import { parseIcsContent } from './icsParser';

const AMBIENT_API_BASE = 'https://tryambientai.com/extension_endpoint';

const EXTRACTOR_SYSTEM_PROMPT = `You are the Extractor agent for a calendar event extraction system. You receive webpage content and extract all calendar events from it.

Return a JSON object with this exact structure:
{
  "events": [
    {
      "event_type": "full_potential_event_details",
      "summary": "<event title as shown on the page>",
      "description": "<event description — capture the actual description from the page>",
      "location": "<location string, or omit if unknown>",
      "start": {
        "date": "<YYYY-MM-DD for all-day events>",
        "dateTime": "<ISO 8601 for timed events, e.g. 2026-04-02T08:30:00>",
        "timeZone": "<IANA timezone if determinable, e.g. America/New_York>"
      },
      "end": {
        "date": "<YYYY-MM-DD for all-day events>",
        "dateTime": "<ISO 8601 for timed events>",
        "timeZone": "<IANA timezone if determinable>"
      },
      "attendees": "<comma-separated names of people listed as attending, or omit>",
      "htmlLink": "<URL to the event detail page, or omit>"
    }
  ],
  "dateRange": { "earliest": "<ISO date>", "latest": "<ISO date>" } or null,
  "confidence": "high" | "medium" | "low",
  "notes": "<any notes about the extraction, or null>"
}

For optional fields, if the value is not present or unknown, omit the field entirely — do not output null.

Rules for event_type:
- "full_potential_event_details": The event has clear dates/times and enough detail to create a calendar entry. Use this for most webpage-extracted events.
- "incomplete_event_details": The event exists but dates or key details are uncertain or missing.

Rules for summary:
- Use the actual event title as it appears on the page (e.g., "Tech Conference 2026", "Weekly Team Standup").
- Do not rephrase or add "planned by" attribution — this is a webpage, not a conversation.

Rules for description:
- Capture the event's actual description from the page.
- Include relevant details like organizer name, ticket info, or RSVP notes when present.
- Contact information visible on the page can go here.
- If the event has recurrence info, include it (e.g., "Recurrence: FREQ=WEEKLY;BYDAY=MO").

Rules for start and end:
- For timed events, use "dateTime" with ISO 8601 format. For all-day events, use "date" with YYYY-MM-DD format.
- Each start/end object should have EITHER "date" OR "dateTime", never both.
- Include "timeZone" when it can be determined from the page (timezone labels, UTC offsets, or known platform defaults).
- Dates should be structured as YYYY-MM-DD (e.g., "2026-04-25").
- When times are ambiguous or missing, use "date" format to treat the event as all-day.
- If an end time is not shown on the page, omit "end" entirely — do not estimate.
- Multi-day events that appear as repeated entries on consecutive days (same title) should be consolidated into a single event with the full date span.

Rules for location:
- Use the most specific location shown on the page. If both a venue name and address are shown, include both.
- If a link to a map or venue is present, include it alongside the name.

Rules for attendees:
- List names of individuals shown as attending, hosting, or performing — as a comma-separated string.
- Omit if no attendee information is visible.

Rules for htmlLink:
- If the event has its own detail page URL (distinct from the listing page), include it.
- Omit if the event has no dedicated link.

General:
- Extract EVERY event visible in the content.
- Set confidence to "high" if dates/times are explicit, "medium" if some fields were inferred from context, "low" if uncertain.
- Always respond with valid JSON only.`;

/**
 * Extract events from HTML DOM content.
 */
export async function extractFromDom(
  cleanedDom: string,
  currentUrl: string,
  apiKey: string | undefined,
  provider: 'gemini_key' | 'ambient_ai'
): Promise<ExtractionResult> {
  console.log(`[CA:extractor] extractFromDom — url=${currentUrl}, domSize=${cleanedDom.length}, provider=${provider}`);
  const userMessage = JSON.stringify({
    contentType: 'html',
    currentUrl,
    content: cleanedDom,
  });
  console.log(`[CA:extractor] User message size: ${userMessage.length} chars`);

  console.log('[CA:extractor] Calling LLM...');
  const startTime = Date.now();
  const responseText = await callLlm(EXTRACTOR_SYSTEM_PROMPT, userMessage, apiKey, provider);
  console.log(`[CA:extractor] LLM response in ${Date.now() - startTime}ms, size=${responseText.length} chars`);
  console.log('[CA:extractor] Raw response:', responseText.substring(0, 2000) + (responseText.length > 2000 ? '...(truncated)' : ''));

  const result = parseExtractionResponse(responseText);
  console.log(`[CA:extractor] Parsed: ${result.events.length} events, confidence=${result.confidence}, dateRange=${JSON.stringify(result.dateRange)}`);
  if (result.notes) console.log(`[CA:extractor] Notes: ${result.notes}`);
  result.events.forEach((e, i) => console.log(`[CA:extractor]   ${i + 1}. "${e.summary}" — ${e.start?.dateTime || e.start?.date || '?'} ${e.location ? `@ ${e.location}` : ''}`));
  return result;
}

/**
 * Extract events from raw content (ICS, JSON, or HTML string).
 */
export async function extractFromContent(
  content: string,
  contentType: 'ics' | 'json' | 'html',
  apiKey: string | undefined,
  provider: 'gemini_key' | 'ambient_ai'
): Promise<ExtractionResult> {
  console.log(`[CA:extractor] extractFromContent — type=${contentType}, contentSize=${content.length}, provider=${provider}`);

  if (contentType === 'ics') {
    console.log('[CA:extractor] Attempting ICS parse with ical.js...');
    try {
      const events = parseIcsContent(content);
      console.log(`[CA:extractor] ical.js parsed ${events.length} events`);
      if (events.length > 0) {
        const dates = events
          .map((e) => e.start?.dateTime || e.start?.date || '')
          .filter(Boolean)
          .sort();
        const result: ExtractionResult = {
          events,
          dateRange: dates.length > 0 ? { earliest: dates[0], latest: dates[dates.length - 1] } : null,
          confidence: 'high',
          notes: `Parsed ${events.length} events from ICS file using ical.js.`,
        };
        events.forEach((e, i) => console.log(`[CA:extractor]   ${i + 1}. "${e.summary}" — ${e.start?.dateTime || e.start?.date || '?'}`));
        return result;
      }
      console.log('[CA:extractor] ical.js returned 0 events, falling back to LLM');
    } catch (e) {
      console.warn('[CA:extractor] ICS parse failed, falling back to LLM:', e);
    }
  }

  const userMessage = JSON.stringify({ contentType, content });
  console.log(`[CA:extractor] Calling LLM for ${contentType} extraction, message size=${userMessage.length}`);
  const startTime = Date.now();
  const responseText = await callLlm(EXTRACTOR_SYSTEM_PROMPT, userMessage, apiKey, provider);
  console.log(`[CA:extractor] LLM response in ${Date.now() - startTime}ms, size=${responseText.length} chars`);

  const result = parseExtractionResponse(responseText);
  console.log(`[CA:extractor] Parsed: ${result.events.length} events, confidence=${result.confidence}`);
  result.events.forEach((e, i) => console.log(`[CA:extractor]   ${i + 1}. "${e.summary}" — ${e.start?.dateTime || e.start?.date || '?'}`));
  return result;
}

// ============ LLM Routing ============

async function callLlm(
  systemPrompt: string,
  userMessage: string,
  apiKey: string | undefined,
  provider: 'gemini_key' | 'ambient_ai'
): Promise<string> {
  if (provider === 'ambient_ai') {
    return callAmbientApi('extractor', systemPrompt, userMessage);
  }

  if (!apiKey) throw new Error('No API key provided for Gemini');
  return callGeminiDirect(systemPrompt, userMessage, apiKey);
}

async function callGeminiDirect(
  systemPrompt: string,
  userMessage: string,
  apiKey: string
): Promise<string> {
  console.log('[CA:extractor] Using Gemini direct API');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
    generationConfig: { responseMimeType: 'application/json' },
  });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
  });

  return result.response.text();
}

async function callAmbientApi(
  role: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  console.log(`[CA:extractor] Using Ambient API — role=${role}`);
  const googleToken = await getCalendarToken();
  console.log(`[CA:extractor] Got Google token (length=${googleToken?.length || 0})`);

  const body = JSON.stringify({ role, system_prompt: systemPrompt, user_message: userMessage });
  console.log(`[CA:extractor] POST ${AMBIENT_API_BASE}/calendar_agent/ — body size=${body.length}`);

  const response = await fetch(`${AMBIENT_API_BASE}/calendar_agent/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${googleToken}`,
    },
    body,
  });

  console.log(`[CA:extractor] Ambient API response: status=${response.status}`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[CA:extractor] Ambient API error: ${errorText}`);
    throw new Error(`Calendar agent API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.success) {
    console.error(`[CA:extractor] Ambient API returned success=false:`, data.error);
    throw new Error(data.error || 'Unknown calendar agent API error');
  }
  console.log(`[CA:extractor] Ambient API response size: ${data.response?.length || 0} chars`);
  return data.response;
}

// ============ Response Parsing ============

/**
 * Attempt to recover a truncated JSON response by finding the last complete
 * event object in the events array and closing the JSON structure.
 */
function recoverTruncatedJson(text: string): any {
  const eventsStart = text.indexOf('"events"');
  if (eventsStart === -1) {
    throw new Error('Truncated JSON recovery failed: no "events" key found');
  }

  const arrayStart = text.indexOf('[', eventsStart);
  if (arrayStart === -1) {
    throw new Error('Truncated JSON recovery failed: no events array found');
  }

  let lastCompleteObj = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = arrayStart + 1; i < text.length; i++) {
    const ch = text[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        lastCompleteObj = i;
      }
    }
  }

  if (lastCompleteObj === -1) {
    throw new Error('Truncated JSON recovery failed: no complete event objects found');
  }

  const recovered = text.substring(arrayStart, lastCompleteObj + 1) + ']';
  const eventsArray = JSON.parse(recovered);
  console.log(`[CA:extractor] Recovered ${eventsArray.length} events from truncated JSON`);

  return {
    events: eventsArray,
    confidence: 'medium',
    notes: `Response was truncated by LLM output limit. Recovered ${eventsArray.length} events from partial response.`,
  };
}

function parseExtractionResponse(text: string): ExtractionResult {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.warn(`[CA:extractor] JSON parse failed, attempting truncated JSON recovery...`);
    parsed = recoverTruncatedJson(cleaned);
  }

  const events: ExtractedEvent[] = (parsed.events || []).map((raw: any) => {
    const event: ExtractedEvent = {
      event_type: raw.event_type || 'full_potential_event_details',
      summary: raw.summary || raw.title || 'Untitled Event',
      description: raw.description || '',
      location: raw.location || undefined,
      attendees: raw.attendees || undefined,
      htmlLink: raw.htmlLink || undefined,
    };

    if (raw.start) {
      event.start = raw.start;
    } else if (raw.startDateTime) {
      const isAllDay = raw.isAllDay || (raw.startDateTime.length === 10);
      event.start = isAllDay
        ? { date: raw.startDateTime.substring(0, 10) }
        : { dateTime: raw.startDateTime };
    }

    if (raw.end) {
      event.end = raw.end;
    } else if (raw.endDateTime) {
      const isAllDay = raw.isAllDay || (raw.endDateTime.length === 10);
      event.end = isAllDay
        ? { date: raw.endDateTime.substring(0, 10) }
        : { dateTime: raw.endDateTime };
    }

    return event;
  });

  return {
    events,
    dateRange: parsed.dateRange || null,
    confidence: parsed.confidence || 'medium',
    notes: parsed.notes || null,
  };
}
