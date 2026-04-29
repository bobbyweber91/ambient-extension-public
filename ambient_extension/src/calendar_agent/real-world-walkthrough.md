# Real-World Walkthrough: Cathedral School for Boys Calendar

This walkthrough traces a complete extraction session on a real Blackbaud-powered school calendar page. It demonstrates the deterministic (zero-LLM) extraction path, plan UI updates at each stage, and the LLM fallback path when static extraction fails.

## Starting Page

The user invokes the extension while on:
```
https://www.cathedralschool.net/calendar?filter_ec=0_8549&filter_ec=0_9235&filter_ec=0_8444&sDate=20260401&eDate=20260430&showAll=0&tab=1&ec=0_8549,0_9235,0_8444&ts=&el=
```

This is a Blackbaud-powered school calendar showing April 2026 in a monthly grid view. The page has:
- ~12 visible events across the month
- Prev/Next navigation links in the calendar header
- A "Filter" toggle and a "List View" toggle
- Event category checkboxes (All-School Events, Rotation Days, Splash Page Event Listings)
- No `.ics` download links anywhere
- No `<script type="application/ld+json">` with schema.org events
- CDN assets served from `bbk12e1-cdn.myschoolcdn.com` (Blackbaud/FPTS platform)
- Hidden inputs containing `sDate`, `eDate`, `ec` values used by the calendar widget

---

## Deterministic Path (Zero LLM Calls)

When Blackbaud is detected with valid URL parameters, the orchestrator bypasses the LLM entirely and runs a fast deterministic flow.

### Step 1: Reconnaissance (Deterministic Scan)

The orchestrator creates a `_recon` plan step and activates it.

**Plan UI state:**
```
[spinner] Scanning and analyzing page    (active)
    Injecting content script...
    Scanning for structured data...
```

The content script scans the DOM:

```json
{
  "icsLinks": [],
  "webcalLinks": [],
  "jsonLdEvents": [],
  "detectedPlatform": "blackbaud",
  "blackbaudParams": {
    "sDate": "20260401",
    "eDate": "20260430",
    "ec": "0_8549,0_9235,0_8444",
    "baseUrl": "https://www.cathedralschool.net/calendar"
  }
}
```

Platform detected as Blackbaud based on the CDN domain `myschoolcdn.com` and URL structure. The `blackbaudParams` are extracted from hidden inputs on the page — these are the parameters needed to construct list view URLs with arbitrary date ranges.

The orchestrator sees `detectedPlatform === 'blackbaud'` with valid `blackbaudParams` and immediately enters the deterministic flow — **no LLM call is made**.

**Plan UI state:**
```
[check] Scanning and analyzing page    Blackbaud calendar detected — using fast extraction
```

### Step 2: Switch to List View

The orchestrator computes a date range: start of current month through the next June 30 (end of school year). Since it's March 2026, this means `sDate=20260301` and `eDate=20260630`.

It constructs a list view URL by setting `tab=0` (list mode) and `showAll=1`:
```
https://www.cathedralschool.net/calendar?sDate=20260301&eDate=20260630&showAll=1&tab=0&ec=0_8549%2C0_9235%2C0_8444
```

**Plan UI state:**
```
[check] Scanning and analyzing page              Blackbaud calendar detected — using fast extraction
[spinner] Switch to list view (Mar 2026 – Jun 2026)  (active)
    Switching to list view with events through June 30...
```

The orchestrator navigates the tab to the list view URL, waits for load, and re-injects the content script.

**Plan UI state after navigation:**
```
[check] Scanning and analyzing page              Blackbaud calendar detected — using fast extraction
[check] Switch to list view (Mar 2026 – Jun 2026)   List view loaded
[circle] Extract all events from list view        (pending)
```

### Step 3: Extract All Events (Static DOM Parsing)

The orchestrator sends a `CA_EXTRACT_STATIC` message to the content script. The content script detects it's on a list view (presence of `li.group.date-break` elements) and calls `extractBlackbaudListView()`.

**Plan UI state:**
```
[check] Scanning and analyzing page              Blackbaud calendar detected — using fast extraction
[check] Switch to list view (Mar 2026 – Jun 2026)   List view loaded
[spinner] Extract all events from list view       (active)
    Extracting events from list view...
```

The static extractor parses each `li.group.date-break` element:

```html
<li class="group date-break in-view">
  <div class="date-icon">
    <div class="month-name">Mar</div>
    <div class="day-number">12</div>
  </div>
  <div class="event-detail non-athletic-event">
    <h4 class="h4-style event-title">
      <a href="/page/event-detail?pk=34391171&fromId=261793">Lent Madness Fundraiser</a>
    </h4>
    <time>
      <span class="event-date">
        <span class="end-date"> to 3/13/2026 </span>
      </span>
    </time>
  </div>
</li>
```

For each item, it extracts:
- **Month/day** from `div.date-icon` → `div.month-name` and `div.day-number`
- **Year** from the URL's `sDate` parameter (fallback: current year)
- **Title** from `h4.event-title a` text
- **Detail link** from `h4.event-title a[href]`, extracting the `pk` value
- **Times** from `span.start-time` and `span.end-time` (if present)
- **End date** from `span.end-date` text (for multi-day events)

Multi-day events are consolidated: if the same `pk` appears on multiple dates, they're merged into a single event with the earliest start and latest end.

**Static extractor returns 38 events** covering March 5 through June 12.

The orchestrator deduplicates and merges:

**Plan UI state after extraction:**
```
[check] Scanning and analyzing page              Blackbaud calendar detected — using fast extraction
[check] Switch to list view (Mar 2026 – Jun 2026)   List view loaded
[check] Extract all events from list view         Found 38 events (38 new)
```

### Session Complete

The session ends immediately. **Total time: ~3 seconds. LLM calls: 0.**

The user sees 38 match cards below the completed plan, each with add/edit controls.

---

## What Makes This Path Fast

**Zero LLM calls.** The entire session runs deterministically — platform detection, URL construction, DOM parsing. No waiting for API responses, no risk of JSON parsing errors, no token costs.

**List view gives complete coverage.** Grid views only render events that fit in calendar cells and often truncate multi-day events or hide events when a day has too many. The list view renders every event in the date range linearly.

**Wide date range in one load.** By setting `sDate` to the start of the current month and `eDate` to June 30, the orchestrator gets all remaining school-year events in a single page load. No pagination, no "next" button clicking.

**`showAll=1` prevents pagination.** Blackbaud's list view can paginate if there are many events. The `showAll=1` parameter forces all events to render on a single page.

**Static DOM parsing is reliable.** Unlike LLM extraction, the static parser uses known CSS selectors that are consistent across Blackbaud installations. It handles edge cases like multi-day events, missing times, and varying date formats deterministically.

---

## LLM Fallback Path

If the static extractor returns 0 events from the list view (e.g., the Blackbaud installation uses a non-standard template) or navigation to the list view fails, the deterministic flow returns `false` and the orchestrator **falls through to the full LLM-driven flow from scratch**. This means it runs the complete reconnaissance → Planner → main loop pipeline on the current page, as if Blackbaud had never been detected.

This is safer than attempting a single LLM extraction call, because the Planner can assess the unfamiliar page structure, discover controls, pick the right strategy, and navigate as needed.

**Plan UI during fallback:**
```
[check] Scanning and analyzing page              Blackbaud calendar detected — using fast extraction
[check] Switch to list view (Mar 2026 – Jun 2026)   List view loaded
[x] Extract all events from list view            Static extraction returned 0 events
    Static extraction found nothing, switching to AI-driven flow...
    Analyzing page structure...
    AI is assessing the page and creating a plan...
[circle] (LLM-generated plan steps appear here)   (pending)
```

From this point, the flow proceeds exactly like the non-Blackbaud path described below — the Planner receives the cleaned DOM, assesses the page, generates a plan outline, and the orchestrator executes it step by step.

---

## Non-Blackbaud Fallback: LLM-Driven Flow

If the deterministic scan does NOT detect Blackbaud (or detects it without valid `blackbaudParams`), the orchestrator proceeds with the standard LLM-driven flow. Here's how that would look on the same Cathedral School page if the platform weren't recognized:

### Iteration 0: LLM Reconnaissance

The orchestrator sends the cleaned DOM to the Planner.

**Key observations the Planner makes:**

1. **URL contains explicit date parameters.** `sDate=20260401` and `eDate=20260430` encode the visible date range in `YYYYMMDD` format.

2. **URL contains filter parameters that must be preserved.** `filter_ec` and `ec` control which event categories are shown.

3. **The calendar has a List View toggle.** The Planner should switch to list view first.

4. **Multi-day events appear as repeated entries** on consecutive days (e.g., "Grade 4 Outdoor Education Trip" on April 1, 2, and 3 with the same `pk`).

**Planner returns:**

```json
{
  "reconnaissance": {
    "currentDateRange": { "start": "2026-04-01", "end": "2026-04-30" },
    "visibleEventCount": 12,
    "calendarType": "monthly",
    "controls": [
      {
        "selector": "a.switch-to-list",
        "elementDescription": "'List View' toggle at top of calendar",
        "inferredFunction": "filter",
        "confidence": "high"
      }
    ],
    "recommendedStrategy": "switch-to-list-then-url-date-range",
    "strategyReasoning": "Calendar is in grid view with a list toggle. URL has sDate/eDate params. Switch to list view first for complete event rendering, then set a wide date range through June 30."
  },
  "decision": {
    "action": {
      "type": "interact",
      "instruction": {
        "goal": "Switch to list view",
        "steps": [
          { "action": "click", "selector": "a.switch-to-list", "description": "Click the List View toggle" },
          { "action": "wait", "waitMs": 2000, "description": "Wait for view to change" }
        ]
      }
    },
    "reasoning": "Grid view hides events. Switch to list view first, then navigate with wide date range.",
    "updatedPhase": "navigating",
    "planStepId": "switch_to_list"
  },
  "discoveredUrlPattern": {
    "template": "/calendar?sDate={sDate}&eDate={eDate}&showAll=1&tab=0&ec=0_8549,0_9235,0_8444",
    "parameters": [
      { "name": "sDate", "currentValue": "20260401", "type": "date" },
      { "name": "eDate", "currentValue": "20260430", "type": "date" }
    ]
  },
  "planOutline": [
    { "id": "switch_to_list", "label": "Switch to list view" },
    { "id": "navigate_wide_range", "label": "Navigate to wide date range (through June 2026)" },
    { "id": "extract_events", "label": "Extract all events" }
  ]
}
```

**Plan UI state after reconnaissance:**
```
[check] Scanning and analyzing page             monthly view, ~12 events visible, strategy: switch-to-list-then-url-date-range
[circle] Switch to list view                     (pending)
[circle] Navigate to wide date range (through June 2026)  (pending)
[circle] Extract all events                      (pending)
```

### Iteration 1: Switch to List View

The Interactor clicks `a.switch-to-list`. This triggers a full page navigation (Blackbaud reloads the page with `tab=0`). The orchestrator detects the navigation error, recovers by waiting for load and re-injecting the content script.

**Plan UI state:**
```
[check] Scanning and analyzing page             monthly view, ~12 events visible
[check] Switch to list view                     Page navigated to list view
[circle] Navigate to wide date range             (pending)
[circle] Extract all events                      (pending)
```

### Iteration 2: Navigate with Wide Date Range

The Planner constructs a URL with `sDate=20260301&eDate=20260630&tab=0&showAll=1` to get all events from March through June in one load.

**Plan UI state:**
```
[check] Scanning and analyzing page             monthly view, ~12 events visible
[check] Switch to list view                     Page navigated to list view
[check] Navigate to wide date range             Navigation complete
[spinner] Extract all events                    (active)
    Cleaning DOM...
    Calling extractor...
```

### Iteration 3: Extract All Events

The Extractor parses all visible events from the list view. Returns ~35 events covering March through June.

**Plan UI state:**
```
[check] Scanning and analyzing page             monthly view, ~12 events visible
[check] Switch to list view                     Page navigated to list view
[check] Navigate to wide date range             Navigation complete
[check] Extract all events                      Found 35 events (35 new), confidence: high
```

**Total: 3 LLM calls** (reconnaissance, one navigation decision, one extraction decision) plus the extraction LLM call. Compare this to the deterministic path which uses 0 LLM calls.

---

## Edge Cases This Page Illustrates

### Multi-day events in list view
"Lent Madness Fundraiser" appears on March 12 with `end-date: to 3/13/2026`. The static extractor parses the end date and creates a single event spanning March 12–13. In grid view, this would appear as two separate day entries with the same `pk`, which the extractor consolidates.

### Events with no clear start/end time
"Early Release Thursday" has dismissal times embedded in description text but no single event time. Both the static extractor and the LLM extractor treat this as an all-day event (using `start.date` instead of `start.dateTime`).

### Contact info as event metadata
Every event on this page has a "Contact:" field. This isn't a standard calendar field. It's placed in the event description, which is free text and useful to have.

### Recurring events that aren't marked as recurring
Hymn Sing appears on multiple dates with different `pk` values — they're separate events in Blackbaud's system, not a recurring series. The extractor correctly treats them as distinct events.

### The `showAll=1` parameter
When set, Blackbaud renders all events in the date range on a single page. Without it, the list view may paginate after ~20 events. The deterministic flow always sets `showAll=1`.

### Date range: next June 30
The orchestrator sets the end date to the next June 30 — if the current month is before July, it uses June 30 of the current year; if July or later, it uses June 30 of next year. This captures the full remaining school year without overshooting into summer when no events are scheduled.
