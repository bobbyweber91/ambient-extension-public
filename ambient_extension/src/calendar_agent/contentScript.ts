/**
 * Calendar Agent content script.
 * Injected programmatically into the active tab when a calendar agent session starts.
 * Handles DOM cleaning, deterministic scanning, interaction execution, and snapshots.
 */

import type {
  InteractionStep,
  StructuredScanResult,
  DomSnapshot,
  PlatformContentHandler,
  PlatformParams,
} from './types';
import type { ExtractedEvent } from '../types';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message.type?.startsWith('CA_')) return false;
  console.log(`[CA:content] Received message: ${message.type}`);

  switch (message.type) {
    case 'CA_GET_CLEANED_DOM':
      try {
        const html = getCleanedDom();
        console.log(`[CA:content] Cleaned DOM: ${html.length} chars`);
        sendResponse({ type: 'dom', html });
      } catch (e) {
        console.error(`[CA:content] getCleanedDom error:`, e);
        sendResponse({ type: 'error', error: (e as Error).message });
      }
      return true;

    case 'CA_RUN_DETERMINISTIC_SCAN':
      try {
        const result = runDeterministicScan();
        console.log(`[CA:content] Deterministic scan result:`, JSON.stringify(result, null, 2));
        sendResponse({ type: 'scan-result', result });
      } catch (e) {
        console.error(`[CA:content] runDeterministicScan error:`, e);
        sendResponse({ type: 'error', error: (e as Error).message });
      }
      return true;

    case 'CA_EXECUTE_INTERACTION':
      console.log(`[CA:content] Executing interaction with ${(message.steps as InteractionStep[]).length} steps`);
      executeInteraction(message.steps as InteractionStep[])
        .then((res) => {
          console.log(`[CA:content] Interaction complete. URL changed: ${res.newUrl !== null}`);
          sendResponse(res);
        })
        .catch((e) => {
          console.error(`[CA:content] Interaction error:`, e);
          sendResponse({ type: 'error', error: (e as Error).message });
        });
      return true;

    case 'CA_GET_DOM_SNAPSHOT':
      try {
        const snapshot = getDomSnapshot();
        console.log(`[CA:content] Snapshot: title="${snapshot.pageTitle}", events=${snapshot.eventElementCount}, hasNav=${snapshot.hasForwardNavControl}`);
        sendResponse({ type: 'snapshot', snapshot });
      } catch (e) {
        console.error(`[CA:content] getDomSnapshot error:`, e);
        sendResponse({ type: 'error', error: (e as Error).message });
      }
      return true;

    case 'CA_EXTRACT_STATIC': {
      try {
        const platformId = message.platformId as string | undefined;
        const handler = platformId
          ? PLATFORM_HANDLERS.find(h => h.id === platformId)
          : getDetectedHandler();
        if (!handler) {
          console.warn(`[CA:content] No platform handler for static extraction`);
          sendResponse({ type: 'static-events', events: [] });
          return true;
        }
        const events = handler.extractEvents();
        console.log(`[CA:content] Static extraction (${handler.id}): ${events.length} events`);
        sendResponse({ type: 'static-events', events });
      } catch (e) {
        console.error(`[CA:content] Static extraction error:`, e);
        sendResponse({ type: 'static-events', events: [] });
      }
      return true;
    }

    default:
      return false;
  }
});

// ============ DOM Cleaning ============

function getCleanedDom(): string {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;

  // Remove script, style, noscript, svg elements
  const removeTags = ['script', 'style', 'noscript', 'svg', 'link[rel="stylesheet"]'];
  for (const sel of removeTags) {
    clone.querySelectorAll(sel).forEach((el) => el.remove());
  }

  // Remove data-* attributes, inline styles, and class attributes to reduce noise
  const allElements = clone.querySelectorAll('*');
  for (const el of allElements) {
    const attrsToRemove: string[] = [];
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-') || attr.name === 'style') {
        attrsToRemove.push(attr.name);
      }
    }
    for (const name of attrsToRemove) {
      el.removeAttribute(name);
    }
  }

  // Remove HTML comments
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  while (walker.nextNode()) {
    comments.push(walker.currentNode as Comment);
  }
  for (const c of comments) {
    c.parentNode?.removeChild(c);
  }

  // Collapse excessive whitespace in the output
  let html = clone.outerHTML;

  // Truncate if extremely large (>500KB) to avoid LLM token limits
  const MAX_SIZE = 500_000;
  if (html.length > MAX_SIZE) {
    html = html.substring(0, MAX_SIZE) + '\n<!-- TRUNCATED: DOM exceeded 500KB -->';
  }

  return html;
}

// ============ Deterministic Scan ============

function runDeterministicScan(): StructuredScanResult {
  const icsLinks: { url: string; linkText: string }[] = [];
  const webcalLinks: { url: string; linkText: string }[] = [];
  const jsonLdEvents: object[] = [];
  let detectedPlatform: string | null = null;

  // Scan <a> and <link> elements for .ics / webcal links
  const allLinks = document.querySelectorAll('a[href], link[href]');
  for (const el of allLinks) {
    const href = el.getAttribute('href') || '';
    const text = el.textContent?.trim() || '';

    if (href.endsWith('.ics') || href.includes('.ics?')) {
      icsLinks.push({ url: resolveUrl(href), linkText: text });
    }
    if (href.startsWith('webcal://')) {
      webcalLinks.push({ url: href, linkText: text });
    }
  }

  // Check for <link rel="alternate" type="text/calendar">
  const altCalLinks = document.querySelectorAll('link[rel="alternate"][type="text/calendar"]');
  for (const el of altCalLinks) {
    const href = el.getAttribute('href');
    if (href) {
      icsLinks.push({ url: resolveUrl(href), linkText: 'alternate calendar link' });
    }
  }

  // Scan for JSON-LD Event data
  const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const el of ldScripts) {
    try {
      const data = JSON.parse(el.textContent || '');
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item['@type'] === 'Event') jsonLdEvents.push(item);
        }
      } else if (data['@type'] === 'Event') {
        jsonLdEvents.push(data);
      } else if (data['@graph']) {
        for (const item of data['@graph']) {
          if (item['@type'] === 'Event') jsonLdEvents.push(item);
        }
      }
    } catch {
      // Ignore malformed JSON-LD
    }
  }

  // Detect Google Calendar embeds and extract calendar IDs
  const googleCalendarIds: string[] = [];
  const gcalIframes = document.querySelectorAll('iframe[src*="calendar.google.com/calendar/embed"]');
  for (const iframe of gcalIframes) {
    const src = iframe.getAttribute('src') || '';
    try {
      const iframeUrl = new URL(src);
      const calIds = iframeUrl.searchParams.getAll('src');
      for (const calId of calIds) {
        if (calId && !googleCalendarIds.includes(calId)) {
          googleCalendarIds.push(calId);
          console.log(`[CA:content] Found Google Calendar embed: ${calId}`);
        }
      }
    } catch {
      // Malformed iframe src
    }
  }

  // Detect platform and extract params via handler registry
  const pageContent = document.documentElement.outerHTML;
  const currentUrl = window.location.href;
  let platformParams: PlatformParams | null = null;

  for (const handler of PLATFORM_HANDLERS) {
    const matched = handler.detectionPatterns.some(p => p.test(currentUrl) || p.test(pageContent));
    if (matched) {
      detectedPlatform = handler.id;
      platformParams = handler.extractParams();
      if (platformParams) {
        console.log(`[CA:content] Platform params (${handler.id}):`, JSON.stringify(platformParams));
      }
      break;
    }
  }

  const result: StructuredScanResult = { icsLinks, webcalLinks, jsonLdEvents, googleCalendarIds, detectedPlatform };
  if (platformParams) {
    result.platformParams = platformParams;
  }

  return result;
}

function resolveUrl(href: string): string {
  try {
    return new URL(href, window.location.href).href;
  } catch {
    return href;
  }
}

// ============ DOM Snapshot ============

function getDomSnapshot(): DomSnapshot {
  const h1 = document.querySelector('h1');
  const title = document.title;

  // Try to identify a calendar region by common selectors
  const calendarSelectors = [
    '.calendar', '#calendar', '[class*="calendar"]', '[id*="calendar"]',
    '.fc', '.fc-view', '[class*="event-list"]', '[class*="events"]',
    'table.calendar', '.cal-grid', '.cal-container',
  ];

  let calendarRegionText = '';
  for (const sel of calendarSelectors) {
    const el = document.querySelector(sel);
    if (el) {
      calendarRegionText = (el.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 2000);
      break;
    }
  }
  if (!calendarRegionText) {
    calendarRegionText = document.body.textContent?.replace(/\s+/g, ' ').trim().substring(0, 3000) || '';
  }

  // Count event-like elements
  const eventSelectors = [
    '.event', '[class*="event"]', '.fc-event', '[data-event]',
    'li[class*="event"]', '.cal-event', 'article[class*="event"]',
  ];
  let eventElementCount = 0;
  for (const sel of eventSelectors) {
    const count = document.querySelectorAll(sel).length;
    if (count > eventElementCount) eventElementCount = count;
  }

  // Check for forward navigation control
  const navSelectors = [
    'button[class*="next"]', 'a[class*="next"]',
    '[aria-label*="next" i]', '[aria-label*="forward" i]',
    'button:has(> [class*="chevron-right"])', 'button:has(> [class*="arrow-right"])',
  ];
  let hasForwardNavControl = false;
  for (const sel of navSelectors) {
    try {
      if (document.querySelector(sel)) {
        hasForwardNavControl = true;
        break;
      }
    } catch {
      // :has() may not be supported in all contexts
    }
  }

  return {
    url: window.location.href,
    pageTitle: title,
    h1Text: h1?.textContent?.trim() || '',
    calendarRegionText,
    eventElementCount,
    hasForwardNavControl,
  };
}

// ============ Platform Handler Registry ============

const blackbaudHandler: PlatformContentHandler = {
  id: 'blackbaud',
  detectionPatterns: [/myschoolcdn\.com|blackbaud/i],

  extractParams(): PlatformParams | null {
    const sDateEl = document.getElementById('sDate') as HTMLInputElement | null;
    const eDateEl = document.getElementById('eDate') as HTMLInputElement | null;
    const ecEl = document.getElementById('ec') as HTMLInputElement | null;
    if (!sDateEl || !eDateEl) return null;
    return {
      platformId: 'blackbaud',
      baseUrl: window.location.origin + window.location.pathname,
      sDate: sDateEl.value,
      eDate: eDateEl.value,
      ec: ecEl?.value || '',
    };
  },

  extractEvents(): ExtractedEvent[] {
    return extractBlackbaudEvents();
  },
};

const finalsiteHandler: PlatformContentHandler = {
  id: 'finalsite',
  detectionPatterns: [/finalsite\.com/i, /class="[^"]*fsCalendar/i],

  extractParams(): PlatformParams | null {
    const calSection = document.querySelector('.fsCalendar[data-calendar-ids]');
    if (calSection) {
      const calendarIds = calSection.getAttribute('data-calendar-ids') || '';
      if (calendarIds.trim()) {
        const elementId = (calSection.id || '').replace('fsEl_', '');
        let calendarsEnabled = false;
        try {
          calendarsEnabled = !!(window as any).FS?.settings?.calendarsEnabled;
        } catch { /* sandboxed */ }
        return {
          platformId: 'finalsite',
          baseUrl: window.location.origin,
          calendarIds,
          elementId,
          calendarsEnabled: String(calendarsEnabled),
        };
      }
    }

    // Fallback: detect static HTML tables with calendar dates
    const tables = document.querySelectorAll('table');
    const hasCalendarTables = Array.from(tables).some(table => {
      const rowHeaders = table.querySelectorAll('td[role="rowheader"]');
      if (rowHeaders.length < 3) return false;
      const dateCell = rowHeaders[0]?.nextElementSibling;
      return dateCell && /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s+\d/i.test(dateCell.textContent || '');
    });

    if (hasCalendarTables) {
      return {
        platformId: 'finalsite',
        baseUrl: window.location.origin,
        extractionMethod: 'static-tables',
      };
    }

    return null;
  },

  extractEvents(): ExtractedEvent[] {
    const widgetEvents = extractFinalsiteWidgetEvents();
    if (widgetEvents.length > 0) return widgetEvents;
    return extractFinalsiteTableEvents();
  },
};

function extractFinalsiteWidgetEvents(): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];
  const eventEls = document.querySelectorAll('.fsCalendarInfo');

  for (const el of eventEls) {
    const titleEl = el.querySelector('.fsCalendarEventTitle');
    const summary = titleEl?.textContent?.trim() || '';
    if (!summary) continue;

    const startTimeEl = el.querySelector('time.fsStartTime');
    const endTimeEl = el.querySelector('time.fsEndTime');
    const locationEl = el.querySelector('.fsLocation');

    const startDt = startTimeEl?.getAttribute('datetime') || '';
    const endDt = endTimeEl?.getAttribute('datetime') || '';
    const location = locationEl?.textContent?.trim() || undefined;

    const descEl = el.querySelector('.fsCalendarEventDetails, .fsCalendarEventDescription');
    const description = descEl?.textContent?.trim() || '';

    const event: ExtractedEvent = {
      event_type: 'full_potential_event_details',
      summary,
      description,
      location,
    };

    if (startDt) {
      event.start = { dateTime: new Date(startDt).toISOString() };
    }
    if (endDt) {
      event.end = { dateTime: new Date(endDt).toISOString() };
    }

    events.push(event);
  }

  console.log(`[CA:content] Finalsite widget extraction: ${events.length} events`);
  return events;
}

function extractFinalsiteTableEvents(): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];
  const tables = document.querySelectorAll('table');

  for (const table of tables) {
    const groupName = findPrecedingHeading(table);

    const rows = table.querySelectorAll('tr');
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) continue;

      const nameCell = cells[0];
      const dateCell = cells[1];
      if (!nameCell || !dateCell) continue;

      const rawSummary = nameCell.textContent?.replace(/\u00a0/g, ' ').trim() || '';
      if (!rawSummary) continue;

      const dateText = dateCell.textContent?.replace(/\u00a0/g, ' ').trim() || '';
      const parsed = parseFinalsiteTableDate(dateText);
      if (!parsed) continue;

      const summary = groupName ? `${rawSummary} (${groupName})` : rawSummary;

      const event: ExtractedEvent = {
        event_type: 'full_potential_event_details',
        summary,
        description: '',
        start: { date: parsed.startDate },
      };

      if (parsed.endDate && parsed.endDate !== parsed.startDate) {
        event.end = { date: incrementDate(parsed.endDate) };
      }

      events.push(event);
    }
  }

  console.log(`[CA:content] Finalsite table extraction: ${events.length} events`);
  return events;
}

function findPrecedingHeading(el: Element): string | null {
  let sibling = el.previousElementSibling;
  while (sibling) {
    if (/^H[1-6]$/.test(sibling.tagName)) {
      return sibling.textContent?.trim() || null;
    }
    sibling = sibling.previousElementSibling;
  }
  return null;
}

function parseFinalsiteTableDate(text: string): { startDate: string; endDate: string | null } | null {
  const clean = text.replace(/\u00a0/g, ' ').trim();
  const M = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  // "Dec. 22, 2025 - Jan. 2, 2026" (cross-year range)
  let m = clean.match(new RegExp(`(${M})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\s*[-–]\\s*(${M})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i'));
  if (m) {
    const start = buildIsoDate(m[1], m[2], m[3]);
    const end = buildIsoDate(m[4], m[5], m[6]);
    if (start) return { startDate: start, endDate: end };
  }

  // "Oct. 2 - Oct. 10, 2025" (cross-month range)
  m = clean.match(new RegExp(`(${M})\\.?\\s+(\\d{1,2})\\s*[-–]\\s*(${M})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i'));
  if (m) {
    const start = buildIsoDate(m[1], m[2], m[5]);
    const end = buildIsoDate(m[3], m[4], m[5]);
    if (start) return { startDate: start, endDate: end };
  }

  // "Nov. 24 - 28, 2025" (same-month range)
  m = clean.match(new RegExp(`(${M})\\.?\\s+(\\d{1,2})\\s*[-–]\\s*(\\d{1,2}),?\\s+(\\d{4})`, 'i'));
  if (m) {
    const start = buildIsoDate(m[1], m[2], m[4]);
    const end = buildIsoDate(m[1], m[3], m[4]);
    if (start) return { startDate: start, endDate: end };
  }

  // "Aug. 11, 2025" (single date)
  m = clean.match(new RegExp(`(${M})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i'));
  if (m) {
    const start = buildIsoDate(m[1], m[2], m[3]);
    if (start) return { startDate: start, endDate: null };
  }

  return null;
}

function buildIsoDate(monthStr: string, day: string, year: string): string | null {
  const m = monthNameToNum(monthStr);
  if (!m) return null;
  return `${year}-${m.toString().padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function monthNameToNum(name: string): number | null {
  const key = name.toLowerCase().replace(/[^a-z]/g, '').substring(0, 3);
  const map: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  return map[key] || null;
}

const PLATFORM_HANDLERS: PlatformContentHandler[] = [
  blackbaudHandler,
  finalsiteHandler,
];

function getDetectedHandler(): PlatformContentHandler | undefined {
  const url = window.location.href;
  const html = document.documentElement.outerHTML;
  return PLATFORM_HANDLERS.find(h =>
    h.detectionPatterns.some(p => p.test(url) || p.test(html))
  );
}

// ============ Blackbaud Static Extraction ============

interface RawBlackbaudEvent {
  pk: string;
  title: string;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  description: string;
  location: string;
  contact: string;
  link: string;
}

function extractBlackbaudEvents(): any[] {
  const listItems = document.querySelectorAll('li.group.date-break');
  const gridItems = document.querySelectorAll('div.event[class*="event-"]');

  console.log(`[CA:content] Blackbaud detection: ${listItems.length} list items, ${gridItems.length} grid items`);

  const rawEvents = listItems.length > 0
    ? extractBlackbaudListView(listItems)
    : extractBlackbaudGridView(gridItems);

  return buildBlackbaudEvents(rawEvents);
}

function extractBlackbaudListView(items: NodeListOf<Element>): Map<string, RawBlackbaudEvent> {
  const eventMap = new Map<string, RawBlackbaudEvent>();
  const defaultYear = getBlackbaudYear();

  for (const li of items) {
    const monthEl = li.querySelector('div.date-icon .month-name');
    const dayEl = li.querySelector('div.date-icon .day-number');
    if (!monthEl || !dayEl) continue;

    const monthStr = monthEl.textContent?.trim() || '';
    const dayStr = dayEl.textContent?.trim() || '';
    const monthNum = MONTH_ABBR[monthStr.toLowerCase()] || 0;
    if (!monthNum) continue;

    const startDate = `${defaultYear}-${monthNum.toString().padStart(2, '0')}-${dayStr.padStart(2, '0')}`;

    const titleEl = li.querySelector('h4.event-title a, h4 a');
    const title = titleEl?.textContent?.trim() || '';
    const href = titleEl?.getAttribute('href') || '';
    const pkMatch = href.match(/pk=(\d+)/);
    const pk = pkMatch ? pkMatch[1] : `list_${startDate}_${title}`;

    const startTimeEl = li.querySelector('span.start-time');
    const endTimeEl = li.querySelector('span.end-time');
    const startTime = startTimeEl?.textContent?.trim() || null;
    const endTime = endTimeEl?.textContent?.replace(/^\s*to\s*/i, '').trim() || null;

    let endDate: string | null = null;
    const endDateEl = li.querySelector('span.end-date');
    if (endDateEl) {
      const endDateText = endDateEl.textContent?.replace(/^\s*to\s*/i, '').trim() || '';
      const parsed = parseMDYDate(endDateText);
      if (parsed) endDate = parsed;
    }

    const descEl = li.querySelector('div.brief-description');
    const rawDesc = descEl?.textContent?.trim() || '';
    const contactEl = li.querySelector('div.contact-info a');
    const contact = contactEl?.textContent?.trim() || '';

    let location = '';
    let description = rawDesc;
    const locMatch = rawDesc.match(/^Location\s*=\s*(.+)/i);
    if (locMatch) {
      location = locMatch[1].trim();
      description = '';
    }

    if (!eventMap.has(pk)) {
      eventMap.set(pk, {
        pk, title, startDate, endDate, startTime, endTime,
        description, location, contact, link: href,
      });
    }
  }

  return eventMap;
}

function extractBlackbaudGridView(items: NodeListOf<Element>): Map<string, RawBlackbaudEvent> {
  const eventMap = new Map<string, RawBlackbaudEvent>();

  for (const el of items) {
    const classes = el.className;
    const pkMatch = classes.match(/event-(\d+)/);
    if (!pkMatch) continue;
    const pk = pkMatch[1];

    const dayHolder = el.closest('li.day-holder');
    const rawDate = dayHolder?.getAttribute('data-date') || '';
    const dateStr = formatYYYYMMDD(rawDate);

    const titleEl = el.querySelector('h4.calendar-event-title a, h4 a');
    const title = titleEl?.textContent?.trim() || '';
    const link = titleEl?.getAttribute('href') || '';

    const startTimeEl = el.querySelector('span.start-time');
    const endTimeEl = el.querySelector('span.end-time');
    const startTime = startTimeEl?.textContent?.trim() || null;
    const endTime = endTimeEl?.textContent?.replace(/^\s*to\s*/i, '').trim() || null;

    const descEl = el.querySelector('div.brief-description');
    const rawDesc = descEl?.textContent?.trim() || '';
    const contactEl = el.querySelector('div.contact-info a');
    const contact = contactEl?.textContent?.trim() || '';

    let location = '';
    let description = rawDesc;
    const locMatch = rawDesc.match(/^Location\s*=\s*(.+)/i);
    if (locMatch) {
      location = locMatch[1].trim();
      description = '';
    }

    const existing = eventMap.get(pk);
    if (existing) {
      if (dateStr > (existing.endDate || existing.startDate)) {
        existing.endDate = dateStr;
      }
    } else {
      eventMap.set(pk, {
        pk, title, startDate: dateStr, endDate: null,
        startTime, endTime, description, location, contact, link,
      });
    }
  }

  return eventMap;
}

function buildBlackbaudEvents(eventMap: Map<string, RawBlackbaudEvent>): any[] {
  const events: any[] = [];

  for (const raw of eventMap.values()) {
    if (!raw.title) continue;

    const event: any = {
      event_type: 'full_potential_event_details',
      summary: raw.title,
      description: raw.description || undefined,
      location: raw.location || undefined,
      attendees: raw.contact || undefined,
      htmlLink: raw.link ? resolveUrl(raw.link) : undefined,
    };

    const isMultiDay = raw.endDate && raw.endDate !== raw.startDate;

    if (isMultiDay || !raw.startTime) {
      event.start = { date: raw.startDate };
      if (isMultiDay) {
        event.end = { date: incrementDate(raw.endDate!) };
      }
    } else {
      const startIso = parseTimeToIso(raw.startDate, raw.startTime);
      event.start = startIso ? { dateTime: startIso } : { date: raw.startDate };
      if (raw.endTime) {
        const endIso = parseTimeToIso(raw.startDate, raw.endTime);
        if (endIso) event.end = { dateTime: endIso };
      }
    }

    events.push(event);
  }

  console.log(`[CA:content] Blackbaud extraction: ${eventMap.size} unique events`);
  events.forEach((e, i) => console.log(`[CA:content]   ${i + 1}. "${e.summary}" — ${e.start?.dateTime || e.start?.date || '?'}`));
  return events;
}

const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function getBlackbaudYear(): number {
  const params = new URLSearchParams(window.location.search);
  const sDate = params.get('sDate');
  if (sDate && sDate.length >= 4) return parseInt(sDate.slice(0, 4));
  return new Date().getFullYear();
}

function parseMDYDate(text: string): string | null {
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

function formatYYYYMMDD(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function incrementDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function parseTimeToIso(isoDate: string, timeStr: string): string | null {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return `${isoDate}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
}

// ============ Interaction Execution ============

async function executeInteraction(
  steps: InteractionStep[]
): Promise<{
  type: 'interaction-executed';
  beforeSnapshot: DomSnapshot;
  afterSnapshot: DomSnapshot;
  newUrl: string | null;
}> {
  const beforeSnapshot = getDomSnapshot();
  const startUrl = window.location.href;
  let stepsCompleted = 0;

  const TIMEOUT_MS = 15_000;
  const startTime = Date.now();

  for (const step of steps) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      console.warn(`[CA:content] Interaction timeout after ${TIMEOUT_MS}ms`);
      break;
    }

    console.log(`[CA:content] Executing step: ${step.action} ${step.selector || ''} — ${step.description}`);
    try {
      switch (step.action) {
        case 'click': {
          if (!step.selector) throw new Error('Click requires a selector');
          const el = document.querySelector(step.selector);
          if (!el) throw new Error(`Element not found: ${step.selector}`);
          console.log(`[CA:content] Clicking element: ${step.selector} (tagName=${el.tagName}, text="${el.textContent?.trim().substring(0, 50)}")`);
          (el as HTMLElement).click();
          await delay(500);
          break;
        }
        case 'type': {
          if (!step.selector) throw new Error('Type requires a selector');
          const el = document.querySelector(step.selector) as HTMLInputElement | null;
          if (!el) throw new Error(`Element not found: ${step.selector}`);
          console.log(`[CA:content] Typing "${step.value}" into ${step.selector}`);
          el.focus();
          el.value = '';
          el.value = step.value || '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          await delay(300);
          break;
        }
        case 'scroll-down': {
          console.log('[CA:content] Scrolling down');
          window.scrollBy(0, window.innerHeight);
          await delay(500);
          break;
        }
        case 'wait': {
          console.log(`[CA:content] Waiting ${step.waitMs || 1000}ms`);
          await delay(step.waitMs || 1000);
          break;
        }
      }
      stepsCompleted++;
      console.log(`[CA:content] Step completed (${stepsCompleted}/${steps.length})`);
    } catch (e) {
      console.error(`[CA:content] Step failed:`, (e as Error).message);
      break;
    }
  }

  // If DOM hasn't changed yet, give it extra time
  let afterSnapshot = getDomSnapshot();
  if (afterSnapshot.calendarRegionText === beforeSnapshot.calendarRegionText) {
    await delay(2000);
    afterSnapshot = getDomSnapshot();
  }

  const newUrl = window.location.href !== startUrl ? window.location.href : null;

  return {
    type: 'interaction-executed',
    beforeSnapshot,
    afterSnapshot,
    newUrl,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

console.log('[Ambient Calendar Agent] Content script injected on:', window.location.href);
