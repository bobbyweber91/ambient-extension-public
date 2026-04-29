# Example Walkthrough

This document shows a complete end-to-end session extracting events from a fictional university calendar page. It demonstrates every agent interaction, every data handoff, every decision point, and how the plan UI updates at each stage. Use this as the ground truth for how the system behaves.

## Scenario

The user is on `https://university.edu/events/calendar` which shows a monthly calendar view for March 2026. There are 8 events visible. The page has a `>` button to advance months. No `.ics` download is available. The URL does not contain date parameters.

---

## Iteration 0: Reconnaissance

### Step 1: Deterministic Scan (no LLM)

The orchestrator creates a deterministic `_recon` plan step and activates it.

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
  "detectedPlatform": null
}
```

Nothing found — no structured downloads, no schema.org markup, no recognized platform.

### Step 2: LLM Reconnaissance

The orchestrator logs a sub-step under the active `_recon` plan step and calls the Planner.

**Plan UI state:**
```
[spinner] Scanning and analyzing page    (active)
    Injecting content script...
    Scanning for structured data...
    Analyzing page structure...
    AI is assessing the page and creating a plan...
```

**Planner receives:**
- The cleaned DOM (scripts/styles stripped)
- The current URL: `https://university.edu/events/calendar`
- The deterministic scan results (empty)

**Planner returns:**

```json
{
  "reconnaissance": {
    "currentDateRange": { "start": "2026-03-01", "end": "2026-03-31" },
    "visibleEventCount": 8,
    "calendarType": "monthly",
    "controls": [
      {
        "selector": "button.cal-nav-next",
        "elementDescription": "> button in calendar header navigation",
        "inferredFunction": "next-period",
        "confidence": "high"
      },
      {
        "selector": "button.cal-nav-prev",
        "elementDescription": "< button in calendar header navigation",
        "inferredFunction": "previous-period",
        "confidence": "high"
      },
      {
        "selector": "select.view-toggle",
        "elementDescription": "dropdown with options: Month, Week, List",
        "inferredFunction": "filter",
        "confidence": "medium"
      }
    ],
    "recommendedStrategy": "paginate-via-controls",
    "strategyReasoning": "No structured data downloads found. URL has no date parameters. Page is a monthly view with clear forward navigation. Will paginate forward using the next-period button."
  },
  "decision": {
    "action": { "type": "extract-current-page" },
    "reasoning": "First iteration. Before navigating, extract the events currently visible on the page.",
    "updatedPhase": "extracting",
    "planStepId": "extract_mar"
  },
  "planOutline": [
    { "id": "extract_mar", "label": "Extract events from March 2026" },
    { "id": "nav_apr", "label": "Navigate to April 2026" },
    { "id": "extract_apr", "label": "Extract events from April 2026" },
    { "id": "nav_may", "label": "Navigate to May 2026" },
    { "id": "extract_may", "label": "Extract events from May 2026" }
  ]
}
```

The orchestrator:
1. Stores the page assessment in `state.reconnaissance`
2. Completes the `_recon` plan step with a result summary
3. Seeds `state.planSteps` from the `planOutline`
4. Proceeds to handle the first decision

**Plan UI state after reconnaissance:**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: paginate-via-controls
    Injecting content script...
    Scanning for structured data...
    Analyzing page structure...
    AI is assessing the page and creating a plan...
[circle] Extract events from March 2026       (pending)
[circle] Navigate to April 2026               (pending)
[circle] Extract events from April 2026       (pending)
[circle] Navigate to May 2026                 (pending)
[circle] Extract events from May 2026         (pending)
```

---

## Iteration 1: Extract Current Page

The orchestrator handles the first decision from reconnaissance. It activates the `extract_mar` plan step.

**Plan UI state:**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: paginate-via-controls
[spinner] Extract events from March 2026      (active)
    Cleaning DOM...
    Calling extractor...
[circle] Navigate to April 2026               (pending)
[circle] Extract events from April 2026       (pending)
[circle] Navigate to May 2026                 (pending)
[circle] Extract events from May 2026         (pending)
```

**Orchestrator routes to Extractor.** Sends current DOM.

**Extractor returns:**

```json
{
  "events": [
    {
      "event_type": "full_potential_event_details",
      "summary": "Faculty Senate Meeting",
      "description": "Regular monthly faculty senate meeting",
      "location": "Admin Building Room 200",
      "start": { "dateTime": "2026-03-05T14:00:00", "timeZone": "America/New_York" },
      "end": { "dateTime": "2026-03-05T16:00:00", "timeZone": "America/New_York" }
    },
    {
      "event_type": "full_potential_event_details",
      "summary": "Spring Break",
      "start": { "date": "2026-03-16" },
      "end": { "date": "2026-03-21" }
    }
  ],
  "dateRange": { "earliest": "2026-03-02", "latest": "2026-03-28" },
  "confidence": "high",
  "notes": null
}
```

(8 events total — only 2 shown for brevity.)

**Orchestrator updates state:**
- `extractedEvents`: 8 events
- `dateRangeCovered`: { earliest: "2026-03-02", latest: "2026-03-28" }
- `iterationCount`: 1
- Completes the `extract_mar` plan step with result

**Plan UI state after extraction:**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: paginate-via-controls
[check] Extract events from March 2026        Found 8 events (8 new), confidence: high
[circle] Navigate to April 2026               (pending)
[circle] Extract events from April 2026       (pending)
[circle] Navigate to May 2026                 (pending)
[circle] Extract events from May 2026         (pending)
```

---

## Iteration 2: Navigate Forward

**Planner receives** updated state.

**Planner returns:**

```json
{
  "action": {
    "type": "interact",
    "instruction": {
      "goal": "Navigate to April 2026",
      "steps": [
        {
          "action": "click",
          "selector": "button.cal-nav-next",
          "description": "Click the next-period button to advance from March to April"
        },
        {
          "action": "wait",
          "waitMs": 1500,
          "description": "Wait for calendar content to update"
        }
      ]
    }
  },
  "reasoning": "Have 8 events for March only. This is a monthly view, so there are likely more future events. Navigating forward via the next-period control.",
  "updatedPhase": "navigating",
  "planStepId": "nav_apr"
}
```

**Orchestrator activates `nav_apr`:**

**Plan UI state:**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: paginate-via-controls
[check] Extract events from March 2026        Found 8 events (8 new), confidence: high
[spinner] Navigate to April 2026              (active)
    Goal: Navigate to April 2026
[circle] Extract events from April 2026       (pending)
[circle] Navigate to May 2026                 (pending)
[circle] Extract events from May 2026         (pending)
```

**Orchestrator routes to Interactor.** Sends the instruction and current DOM.

**Interactor executes:**
1. Finds `button.cal-nav-next` — it exists, clicks it.
2. Waits 1500ms.
3. Observes the DOM changed — header now says "April 2026", new event elements visible.
4. Notes URL did NOT change (still `/events/calendar`).

**Interactor returns:**

```json
{
  "success": true,
  "stepsCompleted": 2,
  "stepsAttempted": 2,
  "observation": "Calendar header changed from 'March 2026' to 'April 2026'. New event entries appeared in the calendar grid. The next/prev navigation buttons are still present.",
  "newUrl": null,
  "domChanged": true,
  "error": null
}
```

**Plan UI state after interaction:**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: paginate-via-controls
[check] Extract events from March 2026        Found 8 events (8 new), confidence: high
[check] Navigate to April 2026               Calendar header changed from 'March 2026' to 'April 2026'...
[circle] Extract events from April 2026       (pending)
[circle] Navigate to May 2026                 (pending)
[circle] Extract events from May 2026         (pending)
```

---

## Iteration 3: Extract April

**Planner receives** updated state with interaction result.

**Planner returns:**

```json
{
  "action": { "type": "extract-current-page" },
  "reasoning": "Navigation to April succeeded. DOM changed with new events. Extract before navigating further.",
  "updatedPhase": "extracting",
  "planStepId": "extract_apr"
}
```

**Plan UI state while extracting:**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: paginate-via-controls
[check] Extract events from March 2026        Found 8 events (8 new), confidence: high
[check] Navigate to April 2026               Calendar header changed from 'March 2026' to 'April 2026'...
[spinner] Extract events from April 2026      (active)
    Cleaning DOM...
    Calling extractor...
[circle] Navigate to May 2026                 (pending)
[circle] Extract events from May 2026         (pending)
```

**Extractor returns** 5 new events for April. Orchestrator deduplicates (no overlap), adds to state. Total: 13 events covering March 2 – April 25.

**Plan UI state after extraction:**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: paginate-via-controls
[check] Extract events from March 2026        Found 8 events (8 new), confidence: high
[check] Navigate to April 2026               Calendar header changed from 'March 2026' to 'April 2026'...
[check] Extract events from April 2026        Found 5 events (5 new), confidence: high
[circle] Navigate to May 2026                 (pending)
[circle] Extract events from May 2026         (pending)
```

---

## Iterations 4–9: Continue Paginating

The pattern repeats: Planner says navigate (with `planStepId`), Interactor clicks `>`, Planner says extract, Extractor pulls events.

- **Iteration 4-5**: Navigate to May (`nav_may`), extract 3 events (`extract_may`).

After iteration 5, the planner decides there may be more events and returns a `planUpdate` adding steps for June:

```json
{
  "action": { "type": "interact", "instruction": { "goal": "Navigate to June 2026", "steps": [...] } },
  "reasoning": "May had 3 events, likely more in June as semester ends. Extending plan.",
  "updatedPhase": "navigating",
  "planStepId": "nav_jun",
  "planUpdate": [
    { "id": "nav_jun", "label": "Navigate to June 2026" },
    { "id": "extract_jun", "label": "Extract events from June 2026" }
  ]
}
```

The orchestrator applies the plan update — all prior completed steps stay, the two new pending steps are added.

**Plan UI state after plan update:**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: paginate-via-controls
[check] Extract events from March 2026        Found 8 events (8 new), confidence: high
[check] Navigate to April 2026               Calendar header changed...
[check] Extract events from April 2026        Found 5 events (5 new), confidence: high
[check] Navigate to May 2026                 Calendar header changed...
[check] Extract events from May 2026          Found 3 events (3 new), confidence: high
[spinner] Navigate to June 2026              (active)
    Goal: Navigate to June 2026
[circle] Extract events from June 2026        (pending)
```

- **Iteration 6-7**: Navigate to June (`nav_jun`), extract 6 events (`extract_jun`).

The planner again extends the plan with a `planUpdate` for July.

- **Iteration 8-9**: Navigate to July, extract 0 events.

**Plan UI state after July extraction:**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: paginate-via-controls
[check] Extract events from March 2026        Found 8 events (8 new), confidence: high
[check] Navigate to April 2026               Calendar header changed...
[check] Extract events from April 2026        Found 5 events (5 new), confidence: high
[check] Navigate to May 2026                 Calendar header changed...
[check] Extract events from May 2026          Found 3 events (3 new), confidence: high
[check] Navigate to June 2026               Calendar header changed...
[check] Extract events from June 2026         Found 6 events (6 new), confidence: high
[check] Navigate to July 2026               Calendar header changed...
[check] Extract events from July 2026         Found 0 events (0 new), confidence: high
```

---

## Iteration 10: Decide to Stop

**Planner receives** updated state:
- `extractedEvents`: 22 events
- `dateRangeCovered`: { earliest: "2026-03-02", latest: "2026-06-28" }
- `iterationCount`: 9
- Last action: extracted 0 events from July

**Planner returns:**

```json
{
  "action": { "type": "done", "reason": "Reached a month with zero events (July 2026). The calendar appears to cover the academic semester. 22 events extracted across March–June 2026." },
  "reasoning": "July returned no events. The pattern suggests this is an academic calendar that ends with the spring semester. No reason to continue paginating into empty months. One empty month is a reasonable stopping signal.",
  "updatedPhase": "complete"
}
```

**Orchestrator marks session complete.** Any remaining pending steps are marked as skipped. The extracted `ExtractedEvent[]` are converted to `MatchResult[]` and displayed using the shared match results UI.

**Final plan UI state:**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: paginate-via-controls
[check] Extract events from March 2026        Found 8 events (8 new), confidence: high
[check] Navigate to April 2026               Calendar header changed...
[check] Extract events from April 2026        Found 5 events (5 new), confidence: high
[check] Navigate to May 2026                 Calendar header changed...
[check] Extract events from May 2026          Found 3 events (3 new), confidence: high
[check] Navigate to June 2026               Calendar header changed...
[check] Extract events from June 2026         Found 6 events (6 new), confidence: high
[check] Navigate to July 2026               Calendar header changed...
[check] Extract events from July 2026         Found 0 events (0 new), confidence: high
```

The user sees 22 match cards below the plan, each with add/edit controls.

---

## Alternative Scenario: URL Pattern Discovered

Suppose at iteration 2, the Interactor had observed that clicking `>` changed the URL to `https://university.edu/events/calendar?month=4&year=2026`.

The Interactor's response would include:
```json
{
  "newUrl": "https://university.edu/events/calendar?month=4&year=2026"
}
```

The Planner on the next iteration would recognize this and update state:

```json
{
  "discoveredUrlPattern": {
    "template": "/events/calendar?month={month}&year={year}",
    "parameters": [
      { "name": "month", "currentValue": "4", "type": "month" },
      { "name": "year", "currentValue": "2026", "type": "year" }
    ],
    "example": "https://university.edu/events/calendar?month=4&year=2026"
  }
}
```

From this point, the Planner would skip interaction entirely and instead emit a `planUpdate` replacing the pending interaction steps with direct navigation:

```json
{
  "action": {
    "type": "navigate-to-url",
    "url": "https://university.edu/events/calendar?month=5&year=2026"
  },
  "reasoning": "Discovered URL pattern with month/year parameters. Can construct future URLs directly without page interaction. Navigating to May 2026.",
  "planStepId": "nav_may",
  "planUpdate": [
    { "id": "nav_may", "label": "Navigate to May (direct URL)" },
    { "id": "extract_may", "label": "Extract events from May 2026" },
    { "id": "nav_jun", "label": "Navigate to June (direct URL)" },
    { "id": "extract_jun", "label": "Extract events from June 2026" }
  ]
}
```

**Plan UI after plan update (pending steps replaced):**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: paginate-via-controls
[check] Extract events from March 2026        Found 8 events (8 new), confidence: high
[check] Navigate to April 2026               Calendar header changed...
[check] Extract events from April 2026        Found 5 events (5 new), confidence: high
[spinner] Navigate to May (direct URL)        (active)
    Navigating to: .../calendar?month=5&year=2026
[circle] Extract events from May 2026         (pending)
[circle] Navigate to June (direct URL)        (pending)
[circle] Extract events from June 2026        (pending)
```

This is faster and more reliable than clicking through pagination one month at a time.

---

## Alternative Scenario: ICS Download Found

Suppose the deterministic scan had found:
```json
{
  "icsLinks": [
    { "url": "/calendar/export.ics", "linkText": "Subscribe to Calendar" }
  ]
}
```

**Plan UI during reconnaissance:**
```
[spinner] Scanning and analyzing page    (active)
    Injecting content script...
    Scanning for structured data...
    Found 1 ICS link(s)
    Analyzing page structure...
    AI is assessing the page and creating a plan...
```

The Planner would return a simpler `planOutline`:
```json
{
  "planOutline": [
    { "id": "download_ics", "label": "Download calendar file (export.ics)" },
    { "id": "parse_events", "label": "Parse events from calendar file" }
  ],
  "decision": {
    "action": {
      "type": "download-file",
      "url": "https://university.edu/calendar/export.ics"
    },
    "reasoning": "ICS subscription link found. This likely contains the full calendar. Download and parse before attempting any page interaction.",
    "updatedPhase": "extracting",
    "planStepId": "download_ics"
  }
}
```

**Plan UI after reconnaissance:**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: use-ics-download
[spinner] Download calendar file (export.ics) (active)
    Downloading: https://university.edu/calendar/export.ics
[circle] Parse events from calendar file      (pending)
```

The orchestrator downloads the file, detects it as ICS content, and routes to the Extractor. Since the download and parse happen in a single action handler, the orchestrator completes both steps:

**Plan UI after download+parse:**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: use-ics-download
[check] Download calendar file (export.ics)   Downloaded and found 47 events (47 new)
[check] Parse events from calendar file       (completed by download handler)
```

If the `.ics` only contained the current month, the Planner would then fall back to page interaction and issue a `planUpdate` with new steps.

---

## Alternative Scenario: No Plan Outline from LLM

If the Planner returns no `planOutline` (or an empty array), the orchestrator builds steps dynamically. Each action creates an ad-hoc plan step.

**Plan UI after a few iterations (all steps auto-generated):**
```
[check] Scanning and analyzing page           list view, ~12 events visible, strategy: static-extraction-only
[check] Extract events from page              Found 12 events (12 new), confidence: high
```

The plan is shorter but still gives the user visibility into what happened.

---

## Error Scenario: Interaction Fails

Suppose the Interactor fails to find a selector:

```json
{
  "success": false,
  "stepsCompleted": 0,
  "stepsAttempted": 1,
  "observation": "Could not find element matching selector 'button.cal-nav-next'. The calendar area appears to have re-rendered with different class names.",
  "newUrl": null,
  "domChanged": false,
  "error": "Element not found: button.cal-nav-next"
}
```

The orchestrator marks the plan step as failed:

**Plan UI state:**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: paginate-via-controls
[check] Extract events from March 2026        Found 8 events (8 new), confidence: high
[x] Navigate to April 2026                    Failed: Element not found: button.cal-nav-next
[circle] Extract events from April 2026       (pending)
[circle] Navigate to May 2026                 (pending)
[circle] Extract events from May 2026         (pending)
```

The Planner would receive this in the action history and could:
1. Request a fresh reconnaissance of the current DOM to find the updated selector.
2. Try an alternative approach (URL manipulation, looking for a different control) and issue a `planUpdate` to revise remaining steps.
3. Decide that what's been collected so far is sufficient and stop — remaining pending steps are marked as skipped.

**Plan UI if planner decides to stop:**
```
[check] Scanning and analyzing page           monthly view, ~8 events visible, strategy: paginate-via-controls
[check] Extract events from March 2026        Found 8 events (8 new), confidence: high
[x] Navigate to April 2026                    Failed: Element not found: button.cal-nav-next
[dash] Extract events from April 2026         (skipped)
[dash] Navigate to May 2026                   (skipped)
[dash] Extract events from May 2026           (skipped)
```

The Planner should NOT retry the same selector — the orchestrator should enforce that the same action+selector combination isn't attempted more than once.

---

## Alternative Scenario: Blackbaud Deterministic Extraction

Suppose the user is on a Blackbaud-powered school calendar at:
```
https://example-school.org/calendar?sDate=20260301&eDate=20260331&tab=1&ec=0_1234,0_5678
```

### Deterministic Scan

The content script scans the DOM and returns:

```json
{
  "icsLinks": [],
  "webcalLinks": [],
  "jsonLdEvents": [],
  "detectedPlatform": "blackbaud",
  "blackbaudParams": {
    "sDate": "20260301",
    "eDate": "20260331",
    "ec": "0_1234,0_5678",
    "baseUrl": "https://example-school.org/calendar"
  }
}
```

The orchestrator detects Blackbaud with valid params and enters the deterministic flow — **no LLM reconnaissance call**.

**Plan UI state:**
```
[check] Scanning and analyzing page              Blackbaud calendar detected — using fast extraction
```

### Switch to List View

The orchestrator computes the date range (March 2026 through June 2026) and constructs:
```
https://example-school.org/calendar?sDate=20260301&eDate=20260630&showAll=1&tab=0&ec=0_1234%2C0_5678
```

It navigates the tab, waits for load, and re-injects the content script.

**Plan UI state:**
```
[check] Scanning and analyzing page              Blackbaud calendar detected — using fast extraction
[check] Switch to list view (Mar 2026 – Jun 2026)   List view loaded
[circle] Extract all events from list view        (pending)
```

### Static Extraction

The content script parses all `li.group.date-break` elements from the list view DOM. No LLM call needed.

**Plan UI state:**
```
[check] Scanning and analyzing page              Blackbaud calendar detected — using fast extraction
[check] Switch to list view (Mar 2026 – Jun 2026)   List view loaded
[check] Extract all events from list view         Found 42 events (42 new)
```

Session complete. **0 LLM calls, ~3 seconds total.**

### LLM Fallback

If the static extractor returns 0 events (non-standard Blackbaud template) or navigation fails, the deterministic flow exits and the orchestrator starts the full LLM-driven flow from scratch — reconnaissance, Planner, main loop — on the current page.

**Plan UI state during fallback:**
```
[check] Scanning and analyzing page              Blackbaud calendar detected — using fast extraction
[check] Switch to list view (Mar 2026 – Jun 2026)   List view loaded
[x] Extract all events from list view            Static extraction returned 0 events
    Static extraction found nothing, switching to AI-driven flow...
    Analyzing page structure...
    AI is assessing the page and creating a plan...
[circle] (LLM-generated plan steps appear here)   (pending)
```

This is the safest fallback — the Planner gets to assess the unfamiliar page, discover controls, and pick its own strategy rather than blindly attempting a single extraction.
