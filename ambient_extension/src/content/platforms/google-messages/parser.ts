/**
 * Google Messages platform implementation
 *
 * Extracts conversation data from the Google Messages web interface DOM.
 * Parses message aria-labels to get sender, text, and timestamp information.
 */

import { SELECTORS, PATTERNS, MONTHS } from './selectors';
import type { ConversationDict, ConversationListItem, StructuredMessage } from '../../../types';
import type { MessagePlatform, PlatformConfig } from '../types';

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

function getDefaultTimezone(): string {
  // TODO: Use Intl.DateTimeFormat().resolvedOptions().timeZone
  return 'America/Los_Angeles';
}

function getTimezoneOffset(date: Date, _timezone: string): string {
  // TODO: Use proper timezone library
  const month = date.getMonth();
  const isDST = month >= 2 && month <= 10;
  return isDST ? '-07:00' : '-08:00';
}

/**
 * Normalize Unicode space variants (Narrow No-Break Space, etc.) to regular spaces.
 * Google Messages uses U+202F in time formatting.
 */
function normalizeSpaces(str: string): string {
  return str
    .replace(/\u202F/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\u2009/g, ' ')
    .replace(/\u200A/g, ' ');
}

function parseAriaLabel(ariaLabel: string): ParsedAriaLabel | null {
  const normalizedLabel = normalizeSpaces(ariaLabel);
  const match = normalizedLabel.match(PATTERNS.ARIA_LABEL);
  if (!match) return null;

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

function isSpecialMessage(text: string): boolean {
  return PATTERNS.SKIP_PATTERNS.some(pattern => pattern.test(text));
}

function buildISODate(parsed: ParsedAriaLabel, second: number): string {
  const monthNum = MONTHS[parsed.month];
  if (monthNum === undefined) {
    throw new Error(`Unknown month: ${parsed.month}`);
  }

  let hour24 = parsed.hour;
  if (parsed.ampm === 'PM' && hour24 !== 12) {
    hour24 += 12;
  } else if (parsed.ampm === 'AM' && hour24 === 12) {
    hour24 = 0;
  }

  const date = new Date(parsed.year, monthNum, parsed.day, hour24, parsed.minute, second);
  const timezone = getDefaultTimezone();
  const offset = getTimezoneOffset(date, timezone);

  const year = parsed.year.toString().padStart(4, '0');
  const month = (monthNum + 1).toString().padStart(2, '0');
  const day = parsed.day.toString().padStart(2, '0');
  const hour = hour24.toString().padStart(2, '0');
  const minute = parsed.minute.toString().padStart(2, '0');
  const sec = second.toString().padStart(2, '0');

  return `${year}-${month}-${day}T${hour}:${minute}:${sec}${offset}`;
}

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
 * Parse a Date from an aria-label string. Returns null if parsing fails.
 */
function getMessageDate(ariaLabel: string): Date | null {
  const normalizedLabel = normalizeSpaces(ariaLabel);
  const match = normalizedLabel.match(PATTERNS.ARIA_LABEL);
  if (!match) return null;

  const [, , , month, day, year, hour, minute, ampm] = match;

  const monthNum = MONTHS[month];
  if (monthNum === undefined) return null;

  let hour24 = parseInt(hour, 10);
  if (ampm === 'PM' && hour24 !== 12) {
    hour24 += 12;
  } else if (ampm === 'AM' && hour24 === 12) {
    hour24 = 0;
  }

  return new Date(parseInt(year, 10), monthNum, parseInt(day, 10), hour24, parseInt(minute, 10));
}

export class GoogleMessagesPlatform implements MessagePlatform {
  config: PlatformConfig = {
    id: 'google-messages',
    name: 'Google Messages',
    urlPatterns: [/messages\.google\.com/],
    requiresActiveTab: true,
  };

  isOnConversationPage(): boolean {
    const url = window.location.href;
    return url.includes('messages.google.com') && url.includes('/conversations/');
  }

  parseConversation(): ConversationDict {
    console.log('Parsing Google Messages conversation from DOM...');

    const title = this.getConversationTitle();
    if (!title) {
      console.warn('Could not find conversation title');
    }

    const structured_messages = this.parseMessages();

    const participants = [...new Set(
      structured_messages
        .map(m => m.sender)
        .filter(sender => sender !== 'You')
    )];

    console.log(`Parsed ${structured_messages.length} messages from conversation: "${title}"`);
    console.log(`Participants: ${participants.join(', ')}`);

    return { title, participants, structured_messages };
  }

  getScrollContainer(): Element | null {
    let container = document.querySelector(SELECTORS.MESSAGE_SCROLL_CONTAINER);
    if (container) return container;

    for (const selector of SELECTORS.MESSAGE_SCROLL_CONTAINER_FALLBACKS) {
      container = document.querySelector(selector);
      if (container) {
        console.log('[Ambient] Found scroll container with fallback selector:', selector);
        return container;
      }
    }

    const firstMessage = document.querySelector(SELECTORS.MESSAGE_TEXT_PART);
    if (firstMessage) {
      let parent = firstMessage.parentElement;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          console.log('[Ambient] Found scroll container via scrollable parent:', parent.tagName, parent.className);
          return parent;
        }
        parent = parent.parentElement;
      }
    }

    return null;
  }

  getOldestMessage(): { element: Element; date: Date } | null {
    const messageParts = document.querySelectorAll(SELECTORS.MESSAGE_TEXT_PART);
    if (messageParts.length === 0) return null;

    const firstMessage = messageParts[0];
    const ariaLabel = firstMessage.getAttribute('aria-label');
    if (!ariaLabel) return null;

    const date = getMessageDate(ariaLabel);
    if (!date) return null;

    return { element: firstMessage, date };
  }

  listConversations(): ConversationListItem[] {
    const items = document.querySelectorAll(SELECTORS.CONVERSATION_LIST_ITEM);
    const result: ConversationListItem[] = [];
    items.forEach((item, index) => {
      const nameEl = item.querySelector(SELECTORS.CONVERSATION_LIST_ITEM_NAME);
      const name = nameEl?.textContent?.trim() || `Conversation ${index}`;
      result.push({ index, name });
    });
    return result;
  }

  async openConversation(index: number): Promise<boolean> {
    const items = document.querySelectorAll(SELECTORS.CONVERSATION_LIST_ITEM);
    const target = items[index] as HTMLElement | undefined;
    if (!target) {
      console.warn(`[Ambient] No conversation at index ${index}`);
      return false;
    }

    const previousTitle = this.getConversationTitle();
    target.click();

    const maxWaitMs = 15000;
    const pollIntervalMs = 500;
    let elapsed = 0;

    while (elapsed < maxWaitMs) {
      await new Promise(r => setTimeout(r, pollIntervalMs));
      elapsed += pollIntervalMs;

      const messages = document.querySelectorAll(SELECTORS.MESSAGE_TEXT_PART);
      if (messages.length > 0) {
        const currentTitle = this.getConversationTitle();
        if (currentTitle && currentTitle !== previousTitle) {
          console.log(`[Ambient] Conversation loaded: "${currentTitle}" (${messages.length} messages, ${elapsed}ms)`);
          return true;
        }
      }
    }

    // Timeout -- check if messages loaded even if title didn't change
    const messages = document.querySelectorAll(SELECTORS.MESSAGE_TEXT_PART);
    if (messages.length > 0) {
      console.warn(`[Ambient] Conversation may have loaded (${messages.length} messages) but title did not change within ${maxWaitMs}ms`);
      return true;
    }

    console.error(`[Ambient] Timed out waiting for conversation at index ${index} to load`);
    return false;
  }

  /**
   * Return diagnostic information about the DOM structure.
   * Useful for debugging selector issues when Google changes the UI.
   */
  getDOMDebugInfo(): object {
    const messagePartsWithAria = document.querySelectorAll(SELECTORS.MESSAGE_TEXT_PART);
    const allMessageParts = document.querySelectorAll('mws-text-message-part');
    const messageWrappers = document.querySelectorAll(SELECTORS.MESSAGE_WRAPPER);

    const ariaLabelMatches: any[] = [];

    messagePartsWithAria.forEach((el, idx) => {
      if (idx < 5) {
        const label = el.getAttribute('aria-label') || '';
        const matchResult = label.match(PATTERNS.ARIA_LABEL);
        ariaLabelMatches.push({
          label: label.substring(0, 150) + (label.length > 150 ? '...' : ''),
          fullLength: label.length,
          matches: matchResult !== null,
          groups: matchResult ? {
            sender: matchResult[1],
            text: matchResult[2]?.substring(0, 50),
            month: matchResult[3],
            day: matchResult[4],
            year: matchResult[5],
          } : null,
        });
      }
    });

    const altSelectors: Record<string, number> = {
      'mws-message-part': document.querySelectorAll('mws-message-part').length,
      'mws-message': document.querySelectorAll('mws-message').length,
      '[data-e2e-message-content]': document.querySelectorAll('[data-e2e-message-content]').length,
      '.text-msg': document.querySelectorAll('.text-msg').length,
      'mws-text-message-part': allMessageParts.length,
      'mws-text-message-part[aria-label]': messagePartsWithAria.length,
    };

    const testStr = "You said: Sure!. Sent on December 20, 2025 at 11:44 AM. Delivered.";
    const testMatch = PATTERNS.ARIA_LABEL.test(testStr);

    const firstLabel = messagePartsWithAria[0]?.getAttribute('aria-label') || '';
    const charAnalysis: { char: string; code: number; position: number }[] = [];
    for (let i = 0; i < firstLabel.length; i++) {
      const code = firstLabel.charCodeAt(i);
      if (code < 32 || code > 126 || code === 160) {
        charAnalysis.push({ char: `[${code}]`, code, position: i });
      }
    }

    const aroundDot = firstLabel.substring(75, 95);
    const aroundDotCodes: { pos: number; char: string; code: number }[] = [];
    for (let i = 75; i < Math.min(95, firstLabel.length); i++) {
      aroundDotCodes.push({ pos: i, char: firstLabel[i], code: firstLabel.charCodeAt(i) });
    }

    return {
      url: window.location.href,
      isConversationPage: this.isOnConversationPage(),
      elementCounts: {
        'mws-text-message-part[aria-label]': messagePartsWithAria.length,
        'mws-text-message-part (any)': allMessageParts.length,
        'mws-message-wrapper': messageWrappers.length,
      },
      alternateSelectors: altSelectors,
      sampleAriaLabels: ariaLabelMatches,
      regexPattern: PATTERNS.ARIA_LABEL.source,
      regexFlags: PATTERNS.ARIA_LABEL.flags,
      testKnownSample: { input: testStr, matches: testMatch },
      charAnalysis: {
        firstLabelLength: firstLabel.length,
        nonAsciiChars: charAnalysis,
        aroundPosition80: aroundDot,
        aroundPosition80Codes: aroundDotCodes,
        fullLabel: firstLabel,
      },
    };
  }

  // ---- private helpers ----

  private getConversationTitle(): string {
    const headerTitle = document.querySelector(SELECTORS.CONVERSATION_TITLE);
    if (headerTitle?.textContent?.trim()) {
      return headerTitle.textContent.trim();
    }

    const fallbackTitle = document.querySelector(SELECTORS.CONVERSATION_TITLE_FALLBACK);
    if (fallbackTitle?.textContent?.trim()) {
      return fallbackTitle.textContent.trim();
    }

    const selectedConv = document.querySelector(SELECTORS.SELECTED_CONVERSATION_NAME);
    if (selectedConv?.textContent?.trim()) {
      return selectedConv.textContent.trim();
    }

    return '';
  }

  private parseMessages(): StructuredMessage[] {
    const messageParts = document.querySelectorAll(SELECTORS.MESSAGE_TEXT_PART);
    const messages: StructuredMessage[] = [];
    const minuteCounters = new Map<string, number>();

    for (const part of messageParts) {
      const ariaLabel = part.getAttribute('aria-label');
      if (!ariaLabel) continue;

      const parsed = parseAriaLabel(ariaLabel);
      if (!parsed) {
        console.warn('Failed to parse aria-label:', ariaLabel);
        continue;
      }

      if (isSpecialMessage(parsed.text)) continue;
      if (!parsed.text) continue;

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
}
