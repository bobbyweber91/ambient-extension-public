/**
 * Facebook Messenger platform implementation
 *
 * Extracts conversation data from the messenger.com web interface DOM.
 * Uses data-pagelet="MWMessageRow" for message rows and
 * data-scope="date_break" for timestamps.
 */

import {
  SELECTORS,
  SYSTEM_MESSAGE_PATTERNS,
  DATE_PATTERNS,
  MONTH_ABBREV,
  DAY_ABBREV,
} from './selectors';
import type { ConversationDict, StructuredMessage, ConversationListItem } from '../../../types';
import type { MessagePlatform, PlatformConfig } from '../types';

// ---- date helpers ----

function normalizeSpaces(str: string): string {
  return str
    .replace(/\u202F/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\u2009/g, ' ')
    .replace(/\u200A/g, ' ');
}

function getDefaultTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
}

function getTimezoneOffsetString(date: Date): string {
  const offsetMinutes = date.getTimezoneOffset();
  const sign = offsetMinutes <= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absMinutes / 60).toString().padStart(2, '0');
  const minutes = (absMinutes % 60).toString().padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

function to24Hour(hour: number, ampm: string): number {
  const upper = ampm.toUpperCase();
  if (upper === 'PM' && hour !== 12) return hour + 12;
  if (upper === 'AM' && hour === 12) return 0;
  return hour;
}

function buildISO(date: Date): string {
  const y = date.getFullYear().toString().padStart(4, '0');
  const mo = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  const h = date.getHours().toString().padStart(2, '0');
  const mi = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${getTimezoneOffsetString(date)}`;
}

/**
 * Parse the aria-hidden date_break text into a Date.
 * Handles four known formats (see selectors.ts DATE_PATTERNS).
 */
function parseDateBreakText(raw: string): Date | null {
  const text = normalizeSpaces(raw).trim();

  let match = text.match(DATE_PATTERNS.SLASH_DATE);
  if (match) {
    const [, month, day, year2, hour, minute, ampm] = match;
    const fullYear = 2000 + parseInt(year2, 10);
    return new Date(
      fullYear,
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      to24Hour(parseInt(hour, 10), ampm),
      parseInt(minute, 10),
    );
  }

  match = text.match(DATE_PATTERNS.MONTH_NAME_DATE);
  if (match) {
    const [, monthAbbr, day, year, hour, minute, ampm] = match;
    const monthNum = MONTH_ABBREV[monthAbbr];
    if (monthNum === undefined) return null;
    return new Date(
      parseInt(year, 10),
      monthNum,
      parseInt(day, 10),
      to24Hour(parseInt(hour, 10), ampm),
      parseInt(minute, 10),
    );
  }

  match = text.match(DATE_PATTERNS.DAY_OF_WEEK_TIME);
  if (match) {
    const [, dayAbbr, hour, minute, ampm] = match;
    const targetDay = DAY_ABBREV[dayAbbr];
    if (targetDay === undefined) return null;
    const now = new Date();
    const currentDay = now.getDay();
    let daysDiff = (currentDay - targetDay + 7) % 7;
    if (daysDiff === 0) daysDiff = 7;
    const target = new Date(now);
    target.setDate(now.getDate() - daysDiff);
    target.setHours(to24Hour(parseInt(hour, 10), ampm), parseInt(minute, 10), 0, 0);
    return target;
  }

  match = text.match(DATE_PATTERNS.TIME_ONLY);
  if (match) {
    const [, hour, minute, ampm] = match;
    const now = new Date();
    now.setHours(to24Hour(parseInt(hour, 10), ampm), parseInt(minute, 10), 0, 0);
    return now;
  }

  return null;
}

// ---- DOM helpers ----

/**
 * Get the text content of a node, excluding content from specified child selectors.
 */
function getTextExcluding(element: Element, excludeSelectors: string[]): string {
  const clone = element.cloneNode(true) as Element;
  for (const selector of excludeSelectors) {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  }
  return clone.textContent?.trim() || '';
}

/**
 * Check whether a MWMessageRow is a system event (not a user message).
 */
function isSystemMessage(row: Element): boolean {
  const text = row.textContent || '';
  if (text.includes('Enter')) return false;
  return SYSTEM_MESSAGE_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Extract the sender name from a message row, if present.
 * Returns "You" for outgoing, the display name for incoming,
 * or null if this row continues a previous sender's group.
 *
 * Two DOM patterns carry the sender identity:
 *  1. <h5> header — first message in a new sender group (contains the
 *     display name, or "X replied to Y" for reply messages).
 *  2. Direct <span class="html-span"> child of a gridcell — screen-reader
 *     label on continuation messages within the same sender group.
 */
function extractSender(row: Element): string | null {
  const h5 = row.querySelector('h5');
  if (h5) {
    const text = h5.textContent?.trim() || '';
    if (text) {
      if (text === 'You sent') return 'You';
      const replyMatch = text.match(/^(.+?)\s+replied to\s+/);
      if (replyMatch) return replyMatch[1].trim();
      return text;
    }
  }

  const gridcells = row.querySelectorAll('[role="gridcell"]');
  for (const gridcell of gridcells) {
    const firstChild = gridcell.children[0];
    if (firstChild?.tagName === 'SPAN' && firstChild.classList.contains('html-span')) {
      const text = firstChild.textContent?.trim() || '';
      if (text === 'You sent') return 'You';
      if (text && text !== 'Enter') return text;
    }
  }

  const allTexts = getVisibleTexts(row);
  if (allTexts.includes('You sent')) return 'You';

  return null;
}

/**
 * Get all visible text nodes from an element (text content of leaf nodes > 1 char).
 */
function getVisibleTexts(element: Element): string[] {
  const texts: string[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent?.trim();
    if (text && text.length > 1) {
      texts.push(text);
    }
  }
  return texts;
}

/**
 * Extract the date from a date_break within this row, if any.
 */
function extractDateFromRow(row: Element): Date | null {
  const dateSpan = row.querySelector(SELECTORS.DATE_BREAK_TIME_SPAN);
  if (!dateSpan) return null;
  const text = dateSpan.textContent;
  if (!text) return null;
  return parseDateBreakText(text);
}

/**
 * Extract the message text from a row, stripping known noise elements
 * (sender headers, date breaks, reactions, seen-by, attachments, buttons).
 */
function extractMessageText(row: Element): string {
  const texts = getVisibleTexts(row);

  const excludeTexts = new Set<string>();
  excludeTexts.add('Enter');
  excludeTexts.add('You sent');

  const h5 = row.querySelector('h5');
  if (h5) {
    getVisibleTexts(h5).forEach(t => excludeTexts.add(t));
  }

  row.querySelectorAll('[role="gridcell"]').forEach(gridcell => {
    const firstChild = gridcell.children[0];
    if (firstChild?.tagName === 'SPAN' && firstChild.classList.contains('html-span')) {
      const text = firstChild.textContent?.trim();
      if (text) excludeTexts.add(text);
    }
  });

  const dateBreakParent = row.querySelector('div[data-scope="date_break"]')?.closest('h4');
  if (dateBreakParent) {
    getVisibleTexts(dateBreakParent).forEach(t => excludeTexts.add(t));
  }

  row.querySelectorAll(SELECTORS.REACTION).forEach(el => {
    getVisibleTexts(el).forEach(t => excludeTexts.add(t));
  });

  row.querySelectorAll(SELECTORS.SEEN_BY).forEach(el => {
    getVisibleTexts(el).forEach(t => excludeTexts.add(t));
  });

  row.querySelectorAll(SELECTORS.ATTACHMENT).forEach(el => {
    getVisibleTexts(el).forEach(t => excludeTexts.add(t));
  });

  const filtered = texts.filter(t => {
    if (excludeTexts.has(t)) return false;
    if (/^Sent(?: [\w\d]+ ago)?$/.test(t)) return false;
    return true;
  });

  return filtered.join('\n').trim();
}

// ---- platform class ----

export class FacebookMessengerPlatform implements MessagePlatform {
  config: PlatformConfig = {
    id: 'facebook-messenger',
    name: 'Facebook Messenger',
    urlPatterns: [/www\.messenger\.com/],
  };

  isOnConversationPage(): boolean {
    const path = window.location.pathname;
    if (path.startsWith('/t/') || path.startsWith('/e2ee/t/')) {
      return true;
    }
    return !!document.querySelector(SELECTORS.CONVERSATION_INFO_BUTTON);
  }

  parseConversation(): ConversationDict {
    console.log('Parsing Facebook Messenger conversation from DOM...');

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
    const main = document.querySelector(SELECTORS.CONVERSATION_MAIN);
    if (!main) return null;

    const walker = document.createTreeWalker(main, NodeFilter.SHOW_ELEMENT);
    let node: Element | null;
    while ((node = walker.nextNode() as Element | null)) {
      const style = window.getComputedStyle(node);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        if (node.scrollHeight > node.clientHeight) {
          return node;
        }
      }
    }

    return main;
  }

  getOldestMessage(): { element: Element; date: Date } | null {
    const rows = document.querySelectorAll(SELECTORS.MESSAGE_ROW);
    if (rows.length === 0) return null;

    for (const row of rows) {
      if (isSystemMessage(row)) continue;

      const date = extractDateFromRow(row);
      if (date) {
        return { element: row, date };
      }
    }

    return { element: rows[0], date: new Date() };
  }

  listConversations(): ConversationListItem[] {
    const chatList = document.querySelector(SELECTORS.CHAT_LIST);
    if (!chatList) return [];

    const links = chatList.querySelectorAll(SELECTORS.CONVERSATION_LINK);
    const result: ConversationListItem[] = [];
    links.forEach((link, index) => {
      const name = link.textContent?.trim().split('\n')[0]?.trim() || `Conversation ${index}`;
      result.push({ index, name });
    });
    return result;
  }

  async openConversation(index: number): Promise<boolean> {
    const chatList = document.querySelector(SELECTORS.CHAT_LIST);
    if (!chatList) {
      console.warn('[Ambient] Chat list not found');
      return false;
    }

    const links = chatList.querySelectorAll(SELECTORS.CONVERSATION_LINK);
    const target = links[index] as HTMLElement | undefined;
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

      const rows = document.querySelectorAll(SELECTORS.MESSAGE_ROW);
      if (rows.length > 0) {
        const currentTitle = this.getConversationTitle();
        if (currentTitle && currentTitle !== previousTitle) {
          console.log(`[Ambient] Conversation loaded: "${currentTitle}" (${rows.length} messages, ${elapsed}ms)`);
          return true;
        }
      }
    }

    const rows = document.querySelectorAll(SELECTORS.MESSAGE_ROW);
    if (rows.length > 0) {
      console.warn(`[Ambient] Conversation may have loaded (${rows.length} messages) but title did not change within ${maxWaitMs}ms`);
      return true;
    }

    console.error(`[Ambient] Timed out waiting for conversation at index ${index} to load`);
    return false;
  }

  getDOMDebugInfo(): object {
    const rows = document.querySelectorAll(SELECTORS.MESSAGE_ROW);
    const dateBreaks = document.querySelectorAll(SELECTORS.DATE_BREAK);
    const dateSpans = document.querySelectorAll(SELECTORS.DATE_BREAK_TIME_SPAN);
    const convInfo = document.querySelector(SELECTORS.CONVERSATION_INFO_BUTTON);
    const main = document.querySelector(SELECTORS.CONVERSATION_MAIN);

    const sampleMessages: object[] = [];
    let sampledCount = 0;
    for (const row of rows) {
      if (sampledCount >= 5) break;
      if (isSystemMessage(row)) continue;

      const sender = extractSender(row);
      const date = extractDateFromRow(row);
      const text = extractMessageText(row);
      const allTexts = getVisibleTexts(row);

      sampleMessages.push({
        sender,
        date: date ? buildISO(date) : null,
        text: text.substring(0, 150) + (text.length > 150 ? '...' : ''),
        allTexts: allTexts.slice(0, 10),
      });
      sampledCount++;
    }

    const dateFormats: string[] = [];
    dateSpans.forEach(span => {
      const text = normalizeSpaces(span.textContent || '').trim();
      if (text) dateFormats.push(text);
    });

    return {
      url: window.location.href,
      pathname: window.location.pathname,
      isOnConversationPage: this.isOnConversationPage(),
      conversationTitle: this.getConversationTitle(),
      elementCounts: {
        'MWMessageRow': rows.length,
        'date_break': dateBreaks.length,
        'date_break_time_span': dateSpans.length,
        'Conversation information button': convInfo ? 1 : 0,
        'role=main': main ? 1 : 0,
      },
      mainAriaLabel: main?.getAttribute('aria-label') || null,
      sampleMessages,
      dateFormats,
    };
  }

  // ---- private helpers ----

  private getConversationTitle(): string {
    const main = document.querySelector(SELECTORS.CONVERSATION_MAIN);
    if (!main) return '';

    const ariaLabel = main.getAttribute('aria-label') || '';

    const titledPrefix = 'Conversation titled ';
    if (ariaLabel.startsWith(titledPrefix)) {
      return this.decodeHTMLEntities(ariaLabel.slice(titledPrefix.length));
    }

    const withPrefix = 'Conversation with ';
    if (ariaLabel.startsWith(withPrefix)) {
      return this.decodeHTMLEntities(ariaLabel.slice(withPrefix.length));
    }

    if (ariaLabel) {
      return this.decodeHTMLEntities(ariaLabel);
    }

    return '';
  }

  private decodeHTMLEntities(text: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  }

  private parseMessages(): StructuredMessage[] {
    const rows = document.querySelectorAll(SELECTORS.MESSAGE_ROW);
    const messages: StructuredMessage[] = [];

    let lastKnownDate: Date | null = null;
    let lastSender: string = 'Unknown';
    let secondCounter = 0;

    for (const row of rows) {
      if (isSystemMessage(row)) continue;

      const rowText = row.textContent || '';
      if (!rowText.includes('Enter')) continue;

      const dateFromBreak = extractDateFromRow(row);
      if (dateFromBreak) {
        lastKnownDate = dateFromBreak;
        secondCounter = 0;
      }

      const sender = extractSender(row);
      if (sender) {
        lastSender = sender;
      }

      const text = extractMessageText(row);
      if (!text) continue;

      let messageDate: string;
      if (dateFromBreak) {
        messageDate = buildISO(dateFromBreak);
      } else if (lastKnownDate) {
        secondCounter++;
        const approxDate = new Date(lastKnownDate.getTime() + secondCounter * 1000);
        messageDate = buildISO(approxDate);
      } else {
        messageDate = buildISO(new Date());
      }

      messages.push({
        sender: lastSender,
        text,
        date: messageDate,
      });
    }

    return messages;
  }
}
