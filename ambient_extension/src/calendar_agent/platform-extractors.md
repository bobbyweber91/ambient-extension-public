# Platform Extractors

Platform extractors are deterministic, zero-LLM extraction modules for known calendar platforms. When the agent detects a recognized platform, it bypasses the LLM entirely and uses the platform extractor to navigate to the best view, parse events from the DOM, and return results in seconds.

Each extractor is a single implementation of a shared interface. To add support for a new platform, implement the interface and register it — no changes to the orchestrator or content script plumbing required.

---

## Architecture

Platform extractors span two execution contexts:

```
┌─────────────────────────────────┐     ┌──────────────────────────────────┐
│        Content Script           │     │     Orchestrator (Service Worker) │
│   (runs in page DOM context)    │     │     (runs in background)         │
│                                 │     │                                  │
│  PlatformContentHandler         │     │  PlatformOrchestratorConfig      │
│  ├── detect(url, html)          │     │  ├── buildExtractionUrl(params,  │
│  ├── extractParams() → params   │────▶│  │     dateRange)               │
│  └── extractEvents() → events   │◀────│  └── (orchestrator navigates,   │
│                                 │     │       then asks content script   │
│                                 │     │       to extract)               │
└─────────────────────────────────┘     └──────────────────────────────────┘
```

**Content script** handles DOM-dependent operations: detecting the platform from page content, extracting URL/config parameters from hidden inputs or the DOM, and parsing events from the page's HTML structure.

**Orchestrator** handles flow control: computing date ranges, constructing URLs from platform parameters, navigating the tab, and deciding whether to fall back to LLM.

---

## Interfaces

### Content Script Side

```typescript
interface PlatformContentHandler {
  /** Unique platform ID, e.g. 'blackbaud', 'eventbrite' */
  id: string;

  /** Regex patterns to match against the page URL and outerHTML.
   *  If ANY pattern matches, this platform is detected. */
  detectionPatterns: RegExp[];

  /** Extract platform-specific params needed for URL construction.
   *  Runs against the live DOM (hidden inputs, URL params, meta tags, etc.).
   *  Returns null if the platform is detected but required params are missing
   *  (triggers LLM fallback). */
  extractParams(): PlatformParams | null;

  /** Parse events directly from the current page DOM.
   *  Should handle all view types the platform supports (list, grid, etc.).
   *  Returns an empty array if the DOM structure doesn't match expectations
   *  (triggers LLM fallback). */
  extractEvents(): ExtractedEvent[];
}
```

### Orchestrator Side

```typescript
interface PlatformOrchestratorConfig {
  /** Must match the content handler's id */
  id: string;

  /** Human-readable name for UI display and logging */
  name: string;

  /** Build the optimal URL for bulk event extraction.
   *  Pure function — uses only the params (from content script) and
   *  the computed date range (from orchestrator). No DOM access.
   *
   *  Should construct a URL that:
   *  - Shows a list/agenda view (not grid/month) when possible
   *  - Covers the full date range in a single page load
   *  - Preserves any user-selected filters from the original params
   *  - Sets "show all" flags to prevent server-side pagination */
  buildExtractionUrl(
    params: PlatformParams,
    dateRange: { sDate: string; eDate: string }
  ): string;
}
```

### Shared Types

```typescript
interface PlatformParams {
  platformId: string;
  baseUrl: string;
  [key: string]: string;
}
```

`PlatformParams` is returned by the content script during the deterministic scan and stored in `StructuredScanResult.platformParams`. The orchestrator reads it and passes it to `buildExtractionUrl()`.

---

## Lifecycle

When a calendar agent session starts, the orchestrator runs this flow:

```
1. Inject content script → run deterministic scan
2. Content script iterates through registered PlatformContentHandlers:
   a. For each handler, test detectionPatterns against URL + page HTML
   b. If matched, call handler.extractParams()
   c. If params returned, set scanResult.detectedPlatform = handler.id
      and scanResult.platformParams = params
   d. Stop at first match
3. Orchestrator receives scan result
4. IF detectedPlatform && platformParams:
   a. Look up PlatformOrchestratorConfig by id
   b. Compute date range (start of current month → next June 30)
   c. Call config.buildExtractionUrl(platformParams, dateRange)
   d. Navigate tab to that URL
   e. Re-inject content script
   f. Send CA_EXTRACT_STATIC → content handler's extractEvents()
   g. IF events.length > 0 → merge events, session complete (return true)
   h. IF events.length === 0 → return false (triggers full LLM fallback)
5. IF no platform detected OR deterministic flow returned false:
   a. Full LLM-driven flow from scratch (Planner reconnaissance → main loop)
```

---

## Date Range Computation

The orchestrator computes the date range centrally for all platform extractors:

- **Start date**: First day of the current month (`YYYYMM01`)
- **End date**: Next June 30
  - If current month is January–June → June 30 of current year
  - If current month is July–December → June 30 of next year

This captures the full remaining school year. The same logic applies to all platforms — school calendars rarely have events over summer, and June 30 is a safe upper bound for non-school calendars too.

The date range is passed to `buildExtractionUrl()` as `{ sDate: "YYYYMMDD", eDate: "YYYYMMDD" }`.

---

## Adding a New Platform Extractor

### Step 1: Create the Content Handler

In `contentScript.ts`, add a new object implementing `PlatformContentHandler`:

```typescript
const myPlatformHandler: PlatformContentHandler = {
  id: 'my-platform',
  detectionPatterns: [/myplatform\.com/i, /my-platform-cdn\.net/i],

  extractParams() {
    // Look for platform-specific elements in the DOM
    const configEl = document.querySelector('meta[name="mp-config"]');
    if (!configEl) return null;

    return {
      platformId: 'my-platform',
      baseUrl: window.location.origin + '/calendar',
      apiToken: configEl.getAttribute('content') || '',
      // ... other platform-specific params
    };
  },

  extractEvents() {
    const events: ExtractedEvent[] = [];
    const items = document.querySelectorAll('.mp-event-item');

    for (const item of items) {
      // Parse each event from known DOM structure
      events.push({
        event_type: 'full_potential_event_details',
        summary: item.querySelector('.title')?.textContent?.trim() || '',
        start: { date: item.getAttribute('data-date') || '' },
        // ... other fields
      });
    }

    return events;
  },
};
```

### Step 2: Register in the Content Handler Array

```typescript
const PLATFORM_HANDLERS: PlatformContentHandler[] = [
  blackbaudHandler,
  myPlatformHandler,
  // ... more handlers
];
```

### Step 3: Create the Orchestrator Config

In `orchestrator.ts`, add a config entry:

```typescript
const PLATFORM_CONFIGS: Record<string, PlatformOrchestratorConfig> = {
  blackbaud: {
    id: 'blackbaud',
    name: 'Blackbaud',
    buildExtractionUrl(params, dateRange) {
      return `${params.baseUrl}?sDate=${dateRange.sDate}&eDate=${dateRange.eDate}&showAll=1&tab=0&ec=${encodeURIComponent(params.ec || '')}`;
    },
  },
  'my-platform': {
    id: 'my-platform',
    name: 'My Platform',
    buildExtractionUrl(params, dateRange) {
      return `${params.baseUrl}/events?from=${dateRange.sDate}&to=${dateRange.eDate}&view=list&token=${params.apiToken}`;
    },
  },
};
```

### Step 4: Done

No changes needed to the orchestrator's `runDeterministicFlow()` or the content script's message handler. The generic flow handles everything:
- Detection iterates through `PLATFORM_HANDLERS`
- `CA_EXTRACT_STATIC` finds the right handler by `detectedPlatform` ID
- The orchestrator looks up the right config by ID and builds the URL

---

## Reference Implementation: Blackbaud

### Detection

```typescript
detectionPatterns: [/myschoolcdn\.com|blackbaud/i]
```

Matches the Blackbaud CDN domain (`bbk12e1-cdn.myschoolcdn.com`) present in page resources, or "blackbaud" in the URL/page content.

### Parameter Extraction

Reads hidden `<input>` elements that Blackbaud injects for its calendar widget:
- `#sDate` → current start date (e.g. `"20260301"`)
- `#eDate` → current end date (e.g. `"20260331"`)
- `#ec` → event category filter (e.g. `"0_8549,0_9235,0_8444"`)
- `baseUrl` → `window.location.origin + window.location.pathname`

Returns `null` if `#sDate` or `#eDate` are missing.

### URL Construction

```
{baseUrl}?sDate={sDate}&eDate={eDate}&showAll=1&tab=0&ec={ec}
```

- `tab=0` → list view (vs `tab=1` for grid/month view)
- `showAll=1` → prevents server-side pagination
- `ec` → preserves the user's category filters

### Event Extraction

Auto-detects the current view type and calls the appropriate parser:

| View | Detection | Parser |
|------|-----------|--------|
| List | `li.group.date-break` elements present | `extractBlackbaudListView()` |
| Grid | `div.event[class*="event-"]` elements present | `extractBlackbaudGridView()` |

**List view parsing** (the primary path after URL navigation):
- Month/day from `div.date-icon > .month-name` + `.day-number`
- Year from URL `sDate` parameter (fallback: current year)
- Title from `h4.event-title a`
- Event PK from `href` attribute (`pk=XXXXX`)
- Times from `span.start-time` / `span.end-time`
- Multi-day end date from `span.end-date`
- Location from description text matching `Location = ...`

**Grid view parsing** (fallback if already on grid):
- PK from CSS class name (`event-XXXXX`)
- Date from `li.day-holder[data-date]`
- Multi-day consolidation by tracking same PK across multiple dates

Both parsers feed into `buildBlackbaudEvents()` which converts raw data to `ExtractedEvent[]`, handling ISO date/time formatting and multi-day event consolidation.

---

## Design Principles

1. **Zero LLM calls on the happy path.** Platform extractors exist to skip the LLM entirely. If the extractor needs to call an LLM, it's not an extractor — it's just the normal agent flow.

2. **Fail fast, fall back completely.** If detection succeeds but extraction fails (0 events), don't try to patch it. Return `false` and let the full LLM flow take over from scratch. The LLM Planner may discover things the static extractor missed.

3. **Preserve user context.** When constructing URLs, always preserve filter parameters, category selections, and other user-set state from the original page. Don't strip query params you don't understand.

4. **Prefer list views.** Grid/month views truncate events to fit in calendar cells. List/agenda views render everything linearly. Always construct URLs that request a list view when the platform supports it.

5. **One page load, one extraction.** The ideal extractor navigates to a single URL that shows all events in the target date range and extracts them in one pass. Avoid pagination if the platform supports "show all" or wide date ranges.

6. **Deterministic parsing over heuristics.** Use exact CSS selectors for known platform templates. Don't guess at DOM structure — if the expected elements aren't there, return 0 events and let the LLM handle it.

---

## Reference Implementation: Finalsite

Finalsite is the second platform extractor and the first to use the `fetch-ics` extraction method — downloading ICS calendar feeds directly instead of navigating and parsing the DOM.

### Research Summary

Finalsite is a major K-12 school website CMS. Their calendar module has two generations of infrastructure, controlled by a per-site `FS.settings.calendarsEnabled` flag.

**Discovery method:** The ICS feed URLs are not visible in the static HTML. They're constructed dynamically by JavaScript when a user clicks the RSS icon (`.fsRSSIcon`). We reverse-engineered the URLs by downloading and analyzing the minified `application-*.js` bundle (~2.2MB). The relevant code is in the calendar module's `.fsRSSIcon` click handler.

**Key DOM elements for detection and parameter extraction:**

```html
<!-- Calendar section with IDs -->
<section class="fsElement fsCalendar fsGrid" id="fsEl_12066"
         data-calendar-ids="352" data-use-new="true">

<!-- RSS icon (triggers JS-built dialog, not a direct link) -->
<a class="fsRSSIcon" title="Calendar RSS" href="#">
```

**Per-page config (inline script):**

```javascript
window.FS.currentPage = { dateFormat: 'md', ... };
const settings = FS.getNS('settings');
settings.calendarsEnabled = false;  // or true
```

### Two ICS URL Patterns

The `calendarsEnabled` flag determines which ICS endpoint is available:

| Flag | URL Pattern | Example |
|------|-------------|---------|
| `false` (legacy) | `https://{host}/calendar/calendar_{calendarId}.ics` | `https://cbschoolsorg.finalsite.com/calendar/calendar_352.ics` |
| `true` (new) | `https://{host}/fs/calendar-manager/events.ics?calendar_ids={id1}&calendar_ids={id2}` | `https://example.finalsite.com/fs/calendar-manager/events.ics?calendar_ids=100&calendar_ids=200` |

**Legacy** is the more common case. The URL is trivially constructable from the calendar ID found in `data-calendar-ids`. Each calendar ID gets its own `.ics` file.

**New-style** uses a single endpoint with query params for all calendar IDs. This endpoint returns empty ICS on legacy sites (valid structure, zero VEVENTs).

The extractor tries the legacy URL first for each calendar ID, then falls back to the new-style URL if no events are found.

### Detection

```typescript
detectionPatterns: [/finalsite\.com/i, /class="[^"]*fsCalendar/i]
```

Matches `finalsite.com` in the URL (most Finalsite-hosted school sites use `*.finalsite.com` subdomains) or the `fsCalendar` CSS class in the page HTML (catches custom-domain deployments).

### Parameter Extraction

Reads from the live DOM:

- **Calendar IDs**: `section.fsCalendar[data-calendar-ids]` → comma-separated list (e.g. `"352"` or `"100,200,305"`)
- **Element ID**: Parsed from `section.fsCalendar[id]` → e.g. `fsEl_12066` → `12066`
- **calendarsEnabled**: `window.FS?.settings?.calendarsEnabled` (boolean, defaults to `false`)
- **Origin**: `window.location.origin`

Returns `null` if no `section.fsCalendar` or no `data-calendar-ids` attribute is found.

### ICS URL Construction

The orchestrator config's `buildIcsUrls()` method constructs URLs per calendar ID:

```
Legacy:  https://{origin}/calendar/calendar_{id}.ics     (per calendar)
New:     https://{origin}/fs/calendar-manager/events.ics?calendar_ids={all ids}  (single URL)
```

The orchestrator fetches each ICS URL, parses with `ical.js`, and merges all events with deduplication.

### DOM Fallback Extraction

If ICS download fails (network error, empty response, blocked by Cloudflare), the content handler falls back to parsing the current page DOM. Finalsite renders events with machine-readable `<time datetime>` elements:

```html
<div class="fsCalendarInfo">
  <a class="fsCalendarEventTitle">Express Youth Basketball</a>
  <div class="fsTimeRange">
    <time datetime="2026-03-01T12:00:00-06:00" class="fsStartTime">...</time>
    <time datetime="2026-03-01T16:00:00-06:00" class="fsEndTime">...</time>
  </div>
  <div class="fsLocation">Lincoln High School Gymnasium</div>
</div>
```

This only captures events visible in the current month view. The LLM Planner handles pagination (clicking `.fsCalendarNextMonth`) if needed.

### Extraction Method: `fetch-ics`

Unlike Blackbaud (which uses `navigate-dom`), Finalsite uses `fetch-ics`:

```
1. Content script detects Finalsite, extracts calendar IDs
2. Orchestrator receives params via deterministic scan
3. Orchestrator constructs ICS URLs (no tab navigation needed)
4. Orchestrator fetches each URL with fetch()
5. Each response is parsed with ical.js (parseIcsContent)
6. Events merged with deduplication
7. Session complete — zero LLM calls, zero tab navigations
```

This is faster and more reliable than DOM parsing because:
- ICS files contain the complete event history, not just the current month
- No page navigation or content script re-injection needed
- No risk of Cloudflare challenges blocking the calendar page itself
- The `fetch()` call runs from the service worker, not the page context
