/**
 * WhatsApp Web platform implementation.
 *
 * Parses the open conversation in WhatsApp Web's message pane. The dominant signal is
 * the `data-pre-plain-text` attribute on each message bubble, which carries the sender
 * name + timestamp in a locale-dependent string like:
 *   "[10:24 AM, 4/27/2026] Sarah Johnson: "
 *
 * The visible message text is a sibling/descendant span. We pair the stamp with the
 * accompanying text, dedupe identical messages (forward chains can repeat), and emit the
 * standard StructuredMessage shape.
 */

import { SELECTORS, PATTERNS } from './selectors';
import type { ConversationDict, ConversationListItem, StructuredMessage } from '../../../types';
import type { MessagePlatform, PlatformConfig } from '../types';

interface ParsedStamp {
  hour24: number;
  minute: number;
  second: number | null;
  year: number;
  month: number; // 0-indexed
  day: number;
  sender: string;
}

function getDefaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
  } catch {
    return 'America/Los_Angeles';
  }
}

function getTimezoneOffset(date: Date, _tz: string): string {
  // Naive but matches the google-messages parser — production runs through LLM extraction
  // which is timezone-tolerant.
  const month = date.getMonth();
  const isDST = month >= 2 && month <= 10;
  return isDST ? '-07:00' : '-08:00';
}

function parsePrePlainText(stamp: string): ParsedStamp | null {
  const m = stamp.match(PATTERNS.PRE_PLAIN_TEXT);
  if (!m) return null;
  const [, hourS, minuteS, secondS, ampm, dateA, dateB, yearS] = m;
  const sender = (m[8] || '').trim();
  if (!sender) return null;

  let hour24 = parseInt(hourS, 10);
  const minute = parseInt(minuteS, 10);
  const second = secondS ? parseInt(secondS, 10) : null;

  if (ampm) {
    const upper = ampm.toUpperCase();
    if (upper === 'PM' && hour24 !== 12) hour24 += 12;
    else if (upper === 'AM' && hour24 === 12) hour24 = 0;
  }

  // Resolve date order. WhatsApp formats per locale: en-US is M/D/YYYY, most other locales
  // are D/M/YYYY. We pick whichever order keeps month ≤ 12 and day ≤ 31. Ambiguous cases
  // (e.g., 3/4/2026) default to D/M/YYYY (the more common worldwide convention) — accept
  // the small downside vs. forcing a locale config.
  const a = parseInt(dateA, 10);
  const b = parseInt(dateB, 10);
  let year = parseInt(yearS, 10);
  if (year < 100) year += 2000;

  let month: number;
  let day: number;
  if (a > 12 && b <= 12) {
    // a must be the day
    day = a;
    month = b - 1;
  } else if (b > 12 && a <= 12) {
    day = b;
    month = a - 1;
  } else {
    // Ambiguous — default to D/M/YYYY (international convention).
    day = a;
    month = b - 1;
  }

  if (month < 0 || month > 11 || day < 1 || day > 31) return null;

  return { hour24, minute, second, year, month, day, sender };
}

function buildISODate(p: ParsedStamp, fallbackSecond: number): string {
  const second = p.second ?? fallbackSecond;
  const date = new Date(p.year, p.month, p.day, p.hour24, p.minute, second);
  const offset = getTimezoneOffset(date, getDefaultTimezone());

  const yyyy = p.year.toString().padStart(4, '0');
  const mm = (p.month + 1).toString().padStart(2, '0');
  const dd = p.day.toString().padStart(2, '0');
  const hh = p.hour24.toString().padStart(2, '0');
  const mi = p.minute.toString().padStart(2, '0');
  const ss = second.toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${offset}`;
}

function getMinuteKey(p: ParsedStamp): string {
  return `${p.year}-${p.month}-${p.day}-${p.hour24}-${p.minute}`;
}

function isSpecialMessage(text: string): boolean {
  if (!text) return true;
  return PATTERNS.SKIP_PATTERNS.some(pat => pat.test(text));
}

function findMessageText(row: Element): string {
  // Prefer the canonical .selectable-text span, fall back to dir="ltr"/"rtl" spans.
  const primaryNodes = row.querySelectorAll(SELECTORS.MESSAGE_TEXT);
  if (primaryNodes.length > 0) {
    const merged: string[] = [];
    primaryNodes.forEach(n => {
      const txt = (n.textContent || '').trim();
      if (txt) merged.push(txt);
    });
    const unique = [...new Set(merged)];
    if (unique.length > 0) return unique.join(' ').trim();
  }
  const fallbackNodes = row.querySelectorAll(SELECTORS.MESSAGE_TEXT_FALLBACK);
  for (const n of fallbackNodes) {
    const txt = (n.textContent || '').trim();
    if (txt && txt.length > 1) return txt;
  }
  return '';
}

export class WhatsAppPlatform implements MessagePlatform {
  config: PlatformConfig = {
    id: 'whatsapp',
    name: 'WhatsApp',
    urlPatterns: [/web\.whatsapp\.com/],
    requiresActiveTab: true,
  };

  isOnConversationPage(): boolean {
    if (!window.location.href.includes('web.whatsapp.com')) return false;
    // Heuristic: a chat is open when the main pane has at least one message stamp.
    return document.querySelector(SELECTORS.PRE_PLAIN_TEXT) !== null;
  }

  parseConversation(): ConversationDict {
    console.log('[Ambient] Parsing WhatsApp conversation from DOM…');

    const title = this.getConversationTitle();
    if (!title) console.warn('[Ambient] Could not find WhatsApp conversation title');

    const structured_messages = this.parseMessages();
    const participants = [...new Set(
      structured_messages.map(m => m.sender).filter(s => s !== 'You'),
    )];

    console.log(`[Ambient] Parsed ${structured_messages.length} WhatsApp messages from "${title}"`);
    return { title, participants, structured_messages };
  }

  getScrollContainer(): Element | null {
    for (const sel of SELECTORS.MESSAGE_SCROLL_CONTAINER_FALLBACKS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    // Last resort: walk up from a message row to the nearest scrollable ancestor.
    const firstRow = document.querySelector(SELECTORS.MESSAGE_ROW);
    if (firstRow) {
      let parent: Element | null = firstRow.parentElement;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') return parent;
        parent = parent.parentElement;
      }
    }
    return null;
  }

  getOldestMessage(): { element: Element; date: Date } | null {
    const stamps = document.querySelectorAll(SELECTORS.PRE_PLAIN_TEXT);
    if (stamps.length === 0) return null;
    for (const el of stamps) {
      const stamp = el.getAttribute('data-pre-plain-text') || '';
      const parsed = parsePrePlainText(stamp);
      if (!parsed) continue;
      const date = new Date(parsed.year, parsed.month, parsed.day, parsed.hour24, parsed.minute, parsed.second ?? 0);
      return { element: el, date };
    }
    return null;
  }

  listConversations(): ConversationListItem[] {
    const items = document.querySelectorAll(SELECTORS.CONVERSATION_LIST_ITEM);
    const out: ConversationListItem[] = [];
    items.forEach((item, index) => {
      const nameEl = item.querySelector(SELECTORS.CONVERSATION_LIST_ITEM_NAME);
      const name = (nameEl?.getAttribute('title') || nameEl?.textContent || `Conversation ${index}`).trim();
      out.push({ index, name });
    });
    return out;
  }

  async openConversation(index: number): Promise<boolean> {
    const items = document.querySelectorAll(SELECTORS.CONVERSATION_LIST_ITEM);
    const target = items[index] as HTMLElement | undefined;
    if (!target) return false;

    const previousTitle = this.getConversationTitle();
    target.click();

    const maxWaitMs = 15000;
    const pollMs = 500;
    let elapsed = 0;
    while (elapsed < maxWaitMs) {
      await new Promise(r => setTimeout(r, pollMs));
      elapsed += pollMs;
      const title = this.getConversationTitle();
      const stampCount = document.querySelectorAll(SELECTORS.PRE_PLAIN_TEXT).length;
      if (stampCount > 0 && title && title !== previousTitle) return true;
    }
    return document.querySelectorAll(SELECTORS.PRE_PLAIN_TEXT).length > 0;
  }

  private getConversationTitle(): string {
    const primary = document.querySelector(SELECTORS.CONVERSATION_TITLE_PRIMARY);
    const titleAttr = primary?.getAttribute('title');
    if (titleAttr?.trim()) return titleAttr.trim();
    const text = primary?.textContent?.trim();
    if (text) return text;

    for (const sel of SELECTORS.CONVERSATION_TITLE_FALLBACKS) {
      const el = document.querySelector(sel);
      const v = el?.getAttribute('title') || el?.textContent || '';
      if (v.trim()) return v.trim();
    }
    return '';
  }

  private parseMessages(): StructuredMessage[] {
    const stampedNodes = document.querySelectorAll(SELECTORS.PRE_PLAIN_TEXT);
    const messages: StructuredMessage[] = [];
    const minuteCounters = new Map<string, number>();
    const seen = new Set<string>();

    for (const stampNode of stampedNodes) {
      const stamp = stampNode.getAttribute('data-pre-plain-text') || '';
      const parsed = parsePrePlainText(stamp);
      if (!parsed) continue;

      // The message text lives within the same message row. Walk up to the row, then read
      // the visible text spans inside it.
      const row: Element = stampNode.closest(SELECTORS.MESSAGE_ROW) || stampNode.parentElement || stampNode;
      const text = findMessageText(row);
      if (!text || isSpecialMessage(text)) continue;

      // Sender mapping: WhatsApp shows the user's own name in their messages; map their
      // own messages to "You" using the heuristic that pre-plain-text on outgoing messages
      // typically lists the saved profile name. We can't reliably detect that without
      // settings, so for now we leave the sender as-is. The autoscheduler resolves identity
      // server-side via participant matching.
      const sender = parsed.sender;

      const minuteKey = getMinuteKey(parsed);
      const second = (minuteCounters.get(minuteKey) || 0) + 1;
      minuteCounters.set(minuteKey, second);

      const dedupeKey = `${minuteKey}|${sender}|${text}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      messages.push({
        sender,
        text,
        date: buildISODate(parsed, second),
      });
    }

    return messages;
  }
}
