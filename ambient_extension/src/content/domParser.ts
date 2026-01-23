/**
 * DOM Parser for Google Messages
 * 
 * Extracts conversation data from the Google Messages web interface DOM.
 * Parses message aria-labels to get sender, text, and timestamp information.
 */

import { SELECTORS, PATTERNS, MONTHS } from './selectors';
import type { ConversationDict, StructuredMessage } from '../types';

/**
 * Parsed message data from aria-label
 */
interface ParsedAriaLabel {
  sender: string;
  text: string;
  month: string;
  day: number;
  year: number;
  hour: number;
  minute: number;
  ampm: string;
}

/**
 * Get the default timezone - placeholder for runtime detection
 * TODO: In Phase 6, this will use Intl.DateTimeFormat().resolvedOptions().timeZone
 */
function getDefaultTimezone(): string {
  // Placeholder - will be replaced with browser detection in Phase 6
  return 'America/Los_Angeles';
}

/**
 * Get timezone offset string for ISO date formatting
 * Returns offset like "-08:00" or "-07:00" based on date and timezone
 */
function getTimezoneOffset(date: Date, timezone: string): string {
  // For now, use a simplified approach based on common US Pacific offsets
  // TODO: Use proper timezone library in Phase 6
  const month = date.getMonth();
  // DST in US is roughly March-November
  const isDST = month >= 2 && month <= 10;
  return isDST ? '-07:00' : '-08:00';
}

/**
 * Normalize special space characters to regular spaces
 * Google Messages uses Narrow No-Break Space (U+202F) in time formatting
 */
function normalizeSpaces(str: string): string {
  // Replace various Unicode space characters with regular space
  return str
    .replace(/\u202F/g, ' ')  // Narrow No-Break Space
    .replace(/\u00A0/g, ' ')  // No-Break Space
    .replace(/\u2009/g, ' ')  // Thin Space
    .replace(/\u200A/g, ' '); // Hair Space
}

/**
 * Parse the aria-label from a message element
 * 
 * Expected format: "[Sender] said: [text]. Received on [Month] [Day], [Year] at [H:MM AM/PM]."
 */
function parseAriaLabel(ariaLabel: string): ParsedAriaLabel | null {
  // Normalize special space characters before matching
  const normalizedLabel = normalizeSpaces(ariaLabel);
  const match = normalizedLabel.match(PATTERNS.ARIA_LABEL);
  if (!match) {
    return null;
  }

  const [, sender, text, month, day, year, hour, minute, ampm] = match;
  
  return {
    sender,
    text: text.trim(),
    month,
    day: parseInt(day, 10),
    year: parseInt(year, 10),
    hour: parseInt(hour, 10),
    minute: parseInt(minute, 10),
    ampm,
  };
}

/**
 * Check if a message text should be skipped (reactions, replies, etc.)
 */
function isSpecialMessage(text: string): boolean {
  return PATTERNS.SKIP_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Convert parsed date components to ISO 8601 string
 * 
 * @param parsed - Parsed aria-label data
 * @param second - The second value to use (for ordering same-minute messages)
 */
function buildISODate(parsed: ParsedAriaLabel, second: number): string {
  const monthNum = MONTHS[parsed.month];
  if (monthNum === undefined) {
    throw new Error(`Unknown month: ${parsed.month}`);
  }
  
  // Convert 12-hour to 24-hour format
  let hour24 = parsed.hour;
  if (parsed.ampm === 'PM' && hour24 !== 12) {
    hour24 += 12;
  } else if (parsed.ampm === 'AM' && hour24 === 12) {
    hour24 = 0;
  }
  
  const date = new Date(parsed.year, monthNum, parsed.day, hour24, parsed.minute, second);
  const timezone = getDefaultTimezone();
  const offset = getTimezoneOffset(date, timezone);
  
  // Format: YYYY-MM-DDTHH:MM:SS-08:00
  const year = parsed.year.toString().padStart(4, '0');
  const month = (monthNum + 1).toString().padStart(2, '0');
  const day = parsed.day.toString().padStart(2, '0');
  const hour = hour24.toString().padStart(2, '0');
  const minute = parsed.minute.toString().padStart(2, '0');
  const sec = second.toString().padStart(2, '0');
  
  return `${year}-${month}-${day}T${hour}:${minute}:${sec}${offset}`;
}

/**
 * Generate a minute key for tracking same-minute messages
 */
function getMinuteKey(parsed: ParsedAriaLabel): string {
  const monthNum = MONTHS[parsed.month];
  let hour24 = parsed.hour;
  if (parsed.ampm === 'PM' && hour24 !== 12) {
    hour24 += 12;
  } else if (parsed.ampm === 'AM' && hour24 === 12) {
    hour24 = 0;
  }
  return `${parsed.year}-${monthNum}-${parsed.day}-${hour24}-${parsed.minute}`;
}

/**
 * Get the conversation title from the DOM
 * 
 * Tries multiple selectors in order of preference:
 * 1. Header title (inside the conversation view)
 * 2. Fallback title container
 * 3. Selected conversation name in sidebar
 */
function getConversationTitle(): string {
  // Try the header title first
  const headerTitle = document.querySelector(SELECTORS.CONVERSATION_TITLE);
  if (headerTitle?.textContent?.trim()) {
    return headerTitle.textContent.trim();
  }
  
  // Try fallback title container
  const fallbackTitle = document.querySelector(SELECTORS.CONVERSATION_TITLE_FALLBACK);
  if (fallbackTitle?.textContent?.trim()) {
    return fallbackTitle.textContent.trim();
  }
  
  // Try selected conversation in sidebar
  const selectedConv = document.querySelector(SELECTORS.SELECTED_CONVERSATION_NAME);
  if (selectedConv?.textContent?.trim()) {
    return selectedConv.textContent.trim();
  }
  
  return '';
}

/**
 * Parse all messages from the DOM
 * 
 * Extracts messages from mws-text-message-part elements with aria-labels.
 * Assigns incrementing seconds to messages within the same minute to preserve order.
 */
function parseMessages(): StructuredMessage[] {
  const messageParts = document.querySelectorAll(SELECTORS.MESSAGE_TEXT_PART);
  const messages: StructuredMessage[] = [];
  
  // Track seconds per minute to preserve ordering
  const minuteCounters = new Map<string, number>();
  
  for (const part of messageParts) {
    const ariaLabel = part.getAttribute('aria-label');
    if (!ariaLabel) {
      continue;
    }
    
    const parsed = parseAriaLabel(ariaLabel);
    if (!parsed) {
      console.warn('Failed to parse aria-label:', ariaLabel);
      continue;
    }
    
    // Skip special messages (reactions, replies, attachments)
    if (isSpecialMessage(parsed.text)) {
      continue;
    }
    
    // Skip empty messages
    if (!parsed.text) {
      continue;
    }
    
    // Assign incrementing seconds for same-minute messages
    const minuteKey = getMinuteKey(parsed);
    const second = (minuteCounters.get(minuteKey) || 0) + 1;
    minuteCounters.set(minuteKey, second);
    
    messages.push({
      sender: parsed.sender,
      text: parsed.text,
      date: buildISODate(parsed, second),
    });
  }
  
  return messages;
}

/**
 * Main function to parse the current Google Messages conversation from the DOM
 * 
 * @returns ConversationDict with title and structured messages
 * @throws Error if parsing fails or no messages found
 */
export function parseConversation(): ConversationDict {
  console.log('Parsing Google Messages conversation from DOM...');
  
  // Get conversation title
  const title = getConversationTitle();
  if (!title) {
    console.warn('Could not find conversation title');
  }
  
  // Parse all messages
  const structured_messages = parseMessages();
  
  // Derive participants from unique senders (excluding "You")
  const participants = [...new Set(
    structured_messages
      .map(m => m.sender)
      .filter(sender => sender !== 'You')
  )];
  
  console.log(`Parsed ${structured_messages.length} messages from conversation: "${title}"`);
  console.log(`Participants: ${participants.join(', ')}`);
  
  return {
    title,
    participants,
    structured_messages,
  };
}

/**
 * Check if we're on a Google Messages conversation page
 */
export function isOnConversationPage(): boolean {
  const url = window.location.href;
  return url.includes('messages.google.com') && url.includes('/conversations/');
}

/**
 * Get the message scroll container element (for scrolling functionality)
 */
export function getScrollContainer(): Element | null {
  return document.querySelector(SELECTORS.MESSAGE_SCROLL_CONTAINER);
}
