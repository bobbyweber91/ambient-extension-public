# Calendar Agent — System Overview

The Calendar Agent is an autonomous event extraction system that runs inside a Chrome extension. Given any webpage with calendar content, it figures out the best way to extract events, executes that strategy, and returns structured `ExtractedEvent[]` data ready for import into the user's Google Calendar.

It operates as a multi-agent architecture: a deterministic **Orchestrator** coordinates three LLM-powered specialist agents (**Planner**, **Extractor**, **Interactor**) plus a **Content Script** that provides DOM access. For recognized platforms (currently Blackbaud), a zero-LLM deterministic fast path bypasses the agents entirely.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SIDEPANEL (UI)                                     │
│                                                                                 │
│   [Start] button ──▶ START_CALENDAR_AGENT message                               │
│   ◀── CalendarAgentProgress { phase, planSteps, eventsFound, activityLog }      │
│   Renders: plan step checklist, event count, activity log                        │
└──────────────────────────────────┬──────────────────────────────────────────────┘
                                   │ chrome.runtime messages
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                   ORCHESTRATOR  (background service worker)                      │
│                         orchestrator.ts                                          │
│                                                                                 │
│   SessionState                                                                  │
│   ├── extractedEvents[], eventHashes (dedup)                                    │
│   ├── reconnaissance { structured, pageAssessment }                             │
│   ├── planSteps[] (UI progress tree)                                            │
│   ├── actionHistory[], iterationCount                                           │
│   └── phase, errorLog, dateRangeCovered                                         │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐        │
│   │                     SESSION LIFECYCLE                               │        │
│   │                                                                     │        │
│   │  1. initialize()                                                    │        │
│   │     ├─ Inject content script                                        │        │
│   │     ├─ Run deterministic scan (CA_RUN_DETERMINISTIC_SCAN)           │        │
│   │     ├─ IF known platform with params → runDeterministicFlow()       │        │
│   │     │   └─ Build URL → navigate → CA_EXTRACT_STATIC → done         │        │
│   │     └─ ELSE → call Planner (reconnaissance) → seed plan → first    │        │
│   │          action                                                     │        │
│   │                                                                     │        │
│   │  2. mainLoop()                                                      │        │
│   │     ├─ Call Planner with condensed state                            │        │
│   │     ├─ Apply planUpdate if returned                                 │        │
│   │     ├─ Route action to handler:                                     │        │
│   │     │   ├── extract-current-page  → Extractor                      │        │
│   │     │   ├── extract-from-content  → Extractor                      │        │
│   │     │   ├── download-file         → fetch + Extractor              │        │
│   │     │   ├── interact              → Interactor                     │        │
│   │     │   ├── navigate-to-url       → chrome.tabs.update             │        │
│   │     │   ├── fetch-api             → fetch + Extractor              │        │
│   │     │   ├── done                  → exit loop                      │        │
│   │     │   └── error                 → exit loop                      │        │
│   │     ├─ Deduplicate events (hash-based)                              │        │
│   │     ├─ Update plan steps                                            │        │
│   │     ├─ Check termination (max iterations, timeout, error cap, loop) │        │
│   │     └─ Repeat                                                       │        │
│   │                                                                     │        │
│   │  3. finalize()                                                      │        │
│   │     ├─ Skip remaining pending steps                                 │        │
│   │     ├─ Final dedup + sort by date                                   │        │
│   │     └─ Return ExtractedEvent[]                                      │        │
│   └─────────────────────────────────────────────────────────────────────┘        │
│                                                                                 │
│   Hard limits: 15 iterations │ 10 min timeout │ 5 errors │ loop detection       │
└────────┬────────────────┬────────────────┬────────────────┬─────────────────────┘
         │                │                │                │
         ▼                ▼                ▼                ▼
┌────────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐
│    PLANNER     │ │  EXTRACTOR   │ │  INTERACTOR  │ │     CONTENT SCRIPT       │
│  planner.ts    │ │ extractor.ts │ │ interactor.ts│ │   contentScript.ts       │
│                │ │              │ │              │ │  (injected into tab)     │
│  LLM agent     │ │  LLM agent   │ │  LLM agent   │ │                          │
│  Decides the   │ │  Parses HTML,│ │  Executes    │ │  CA_GET_CLEANED_DOM      │
│  next action   │ │  ICS, JSON   │ │  click/type/ │ │  CA_RUN_DETERMINISTIC_SCAN│
│  for the       │ │  into        │ │  scroll/wait │ │  CA_EXECUTE_INTERACTION  │
│  session       │ │  ExtractedEv │ │  and assesses│ │  CA_GET_DOM_SNAPSHOT     │
│                │ │  ent[]       │ │  results via │ │  CA_EXTRACT_STATIC       │
│  First call:   │ │              │ │  before/after│ │                          │
│  reconnaissance│ │  ICS: uses   │ │  DOM snapshot│ │  Platform handlers:      │
│  + plan outline│ │  ical.js     │ │  diffing     │ │  ├── Blackbaud           │
│                │ │  first, LLM  │ │              │ │  └── (extensible)        │
│  Later calls:  │ │  as fallback │ │              │ │                          │
│  one action    │ │              │ │              │ │  DOM cleaning, scanning, │
│  per call      │ │              │ │              │ │  interaction execution,  │
│                │ │              │ │              │ │  static event parsing    │
└───────┬────────┘ └──────┬───────┘ └──────┬───────┘ └──────────┬───────────────┘
        │                 │                │                     │
        └────────┬────────┴────────┬───────┘                     │
                 ▼                 ▼                              │
        ┌──────────────────────────────┐        chrome.tabs.sendMessage
        │        LLM BACKEND           │        ◄────────────────┘
        │                              │
        │  Provider: gemini_key        │
        │    → Google Gemini 2.5 Flash │
        │                              │
        │  Provider: ambient_ai        │
        │    → Ambient API proxy       │
        │      (tryambientai.com)      │
        └──────────────────────────────┘
```

---

## File-by-File Reference

### `types.ts` — Shared Type Definitions

All data structures that flow between components. Key types:

| Type | Purpose |
|------|---------|
| `SessionState` | Full orchestrator state: events, hashes, reconnaissance, plan steps, phase, history |
| `PlannerDecision` / `PlannerAction` | What the Planner returns — one action + reasoning + plan step mapping |
| `ExtractionResult` | What the Extractor returns — events, date range, confidence |
| `InteractionResult` | What the Interactor returns — success, observation, DOM change info |
| `PlanStep` / `SubStepEntry` | Structured progress tracking displayed in the sidepanel UI |
| `CalendarAgentProgress` | Message format for background → sidepanel progress updates |
| `CalendarAgentContentMessage` / `CalendarAgentContentResponse` | Message protocol between service worker and content script |
| `PageAssessment` / `ReconnaissanceResult` | LLM's assessment of the page structure, controls, and strategy |
| `PlatformContentHandler` / `PlatformOrchestratorConfig` | Interfaces for deterministic platform extractors |

### `orchestrator.ts` — Session Controller

The deterministic backbone. Runs in the extension's background service worker. Responsibilities:

- **Session lifecycle**: `initialize()` → `mainLoop()` → `finalize()`
- **State management**: Maintains `SessionState` across the entire session
- **Agent routing**: Dispatches Planner decisions to the appropriate handler (Extractor, Interactor, file download, URL navigation, API fetch)
- **Plan step tracking**: Manages the step tree shown in the UI — add, activate, complete, fail, skip
- **Deduplication**: Hash-based event dedup via `computeEventHash()` before merging
- **Platform fast path**: `runDeterministicFlow()` for known platforms — zero LLM calls
- **Content script communication**: Injects and messages the content script via `chrome.tabs.sendMessage`
- **Termination guards**: Max iterations (15), session timeout (10 min), error cap (5), infinite loop detection
- **Navigation recovery**: Handles interactions that trigger full page navigations by re-injecting the content script

### `planner.ts` — Planner Agent

The strategic brain. An LLM agent that receives condensed session state and returns exactly one decision per call.

**First call (reconnaissance):** Receives the cleaned DOM + scan results. Returns a `PageAssessment` (calendar type, visible events, controls, recommended strategy), a `planOutline` (steps displayed to the user), and the first `PlannerDecision`.

**Subsequent calls:** Receives event count, date range, action history, errors, current URL. Returns a single `PlannerDecision` with an action, reasoning, and optional `planUpdate` to revise pending steps.

**Strategy priorities (highest to lowest):**
1. ICS/webcal download if links found
2. JSON-LD structured data in page
3. API endpoint
4. Switch to list view + URL date range manipulation (bulk)
5. URL date range manipulation (even in grid view)
6. DOM interaction / pagination (last resort)
7. Static extraction only

**Key behaviors:**
- Always prefers list/agenda view over grid/month view
- Prefers bulk extraction (wide date range in one load) over month-by-month pagination
- Recognizes URL patterns (date parameters) and switches from interaction to direct navigation
- Uses `planStepId` to tell the orchestrator which UI step each action belongs to

### `extractor.ts` — Extractor Agent

Parses content into `ExtractedEvent[]`. Handles three content types:

- **HTML**: Sends cleaned DOM to LLM, which identifies and structures all visible events
- **ICS**: Uses `ical.js` for deterministic parsing first; falls back to LLM if the library returns 0 events
- **JSON**: LLM maps fields to the event schema (handles schema.org/Event and arbitrary JSON)

Also includes **truncated JSON recovery** — if the LLM output is cut off mid-response, it finds the last complete event object in the array and closes the JSON structure, salvaging partial results.

### `interactor.ts` — Interactor Agent

A hybrid deterministic + LLM component. The content script executes browser actions (click, type, scroll, wait), and the LLM interprets the before/after DOM snapshots to produce a meaningful observation.

**Flow:** Orchestrator sends `InteractionInstruction` → content script executes steps and captures before/after `DomSnapshot` → LLM assesses what changed → returns `InteractionResult` with success/failure, observation, URL change status.

The observation is critical — it's how the Planner "sees" what happened. Good observations are specific ("Calendar header changed from 'March 2026' to 'April 2026'") rather than vague ("the page changed").

### `contentScript.ts` — DOM Access Layer

Injected programmatically into the active tab. Handles five message types:

| Message | Response | Purpose |
|---------|----------|---------|
| `CA_GET_CLEANED_DOM` | Cleaned HTML string | Strips scripts, styles, comments, data-attrs for LLM consumption |
| `CA_RUN_DETERMINISTIC_SCAN` | `StructuredScanResult` | Scans for ICS links, webcal links, JSON-LD events, platform detection |
| `CA_EXECUTE_INTERACTION` | Before/after `DomSnapshot` | Executes click/type/scroll/wait steps, compares DOM state |
| `CA_GET_DOM_SNAPSHOT` | `DomSnapshot` | Lightweight page state (title, calendar text, event count, nav controls) |
| `CA_EXTRACT_STATIC` | `ExtractedEvent[]` | Platform-specific static DOM parsing (e.g., Blackbaud list/grid views) |

Also contains the **platform handler registry** (`PLATFORM_HANDLERS`). Each handler has detection patterns, parameter extraction, and event parsing logic. Currently implements Blackbaud with list view and grid view parsers.

### `hash.ts` — Event Deduplication

Computes a deterministic 53-bit hash (cyrb53) from `lowercase(summary) + startDate + lowercase(location)`. Used by the orchestrator to prevent duplicate events when extracting from overlapping pages or re-extracting after navigation.

### `icsParser.ts` — ICS File Parser

Wraps the `ical.js` library. Converts raw ICS content into `ExtractedEvent[]`. Handles:
- Timed events (DTSTART/DTEND with time → `dateTime`)
- All-day events (DATE values → `date`)
- Location, description, summary
- Recurrence rules (appended to description)

### `permissions.ts` — Host Permission Utilities

Chrome extension permission helpers for requesting per-domain access. Extracts origin patterns from URLs and provides check/request/ensure helpers.

---

## Data Flow

### Happy path (known platform — Blackbaud)

```
User clicks "Extract" in sidepanel
    → Orchestrator injects content script
    → Content script runs deterministic scan
    → Detects Blackbaud, extracts hidden input params
    → Orchestrator builds list-view URL (wide date range, showAll=1)
    → Navigates tab to constructed URL
    → Re-injects content script
    → Content script parses list DOM → ExtractedEvent[]
    → Orchestrator deduplicates, sorts, returns events
    ⏱ ~3 seconds, 0 LLM calls
```

### Standard path (unknown page — LLM-driven)

```
User clicks "Extract" in sidepanel
    → Orchestrator injects content script
    → Content script runs deterministic scan (no platform match)
    → Orchestrator sends cleaned DOM to Planner
    → Planner assesses page, picks strategy, returns plan outline + first action
    → Orchestrator seeds UI plan steps
    → Main loop:
        → Execute action (extract / interact / navigate / download / fetch)
        → Merge new events (dedup by hash)
        → Report progress to sidepanel
        → Call Planner for next decision
        → Repeat until done / max iterations / timeout
    → Finalize: dedup, sort, return events
    ⏱ 10–60 seconds, 3–10+ LLM calls depending on page complexity
```

---

## LLM Provider Configuration

All three agents (Planner, Extractor, Interactor) support two LLM backends:

| Provider | Model | How it works |
|----------|-------|--------------|
| `gemini_key` | Gemini 2.5 Flash | Direct API call with user's own API key. JSON response mode. |
| `ambient_ai` | Ambient proxy | POST to `tryambientai.com/extension_endpoint/calendar_agent/` with a Google auth token. Server-side LLM routing. |

Each agent sends a system prompt + user message. Responses are expected as raw JSON (markdown fences are stripped if present).

---

## Termination Conditions

The orchestrator enforces hard limits to prevent runaway sessions:

| Condition | Default | Behavior |
|-----------|---------|----------|
| Max iterations | 15 | Finalize with whatever events have been collected |
| Session timeout | 10 minutes | Same |
| Error cap | 5 errors | Terminate with error phase |
| Loop detection | 2 identical action+result pairs in a row | Finalize |
| Planner says `done` | — | Normal completion |
| Planner says `error` | — | Error termination |

---

## Platform Extractors

Deterministic, zero-LLM extraction modules for known calendar platforms. Two-registry architecture:

- **Content script** (`PLATFORM_HANDLERS`): Detection, parameter extraction, event parsing from DOM
- **Orchestrator** (`PLATFORM_CONFIGS`): URL construction from extracted parameters

### Currently supported

| Platform | Detection | Fast path |
|----------|-----------|-----------|
| Blackbaud | `myschoolcdn.com` or `blackbaud` in URL/page | Build list-view URL with wide date range → static DOM parse |

### Adding a new platform

1. Implement `PlatformContentHandler` in `contentScript.ts` (detection patterns, param extraction, event parsing)
2. Register in `PLATFORM_HANDLERS` array
3. Add `PlatformOrchestratorConfig` in `orchestrator.ts` (URL construction)
4. Register in `PLATFORM_CONFIGS` map

No changes to the orchestrator's `runDeterministicFlow()` or the content script message handler — the generic flow handles everything by platform ID lookup.

---

## Plan Step UI

The sidepanel displays a live progress tree built from `PlanStep[]`:

```
[check]   Scanning and analyzing page              monthly view, ~8 events, strategy: paginate
[check]   Extract events from March 2026           Found 8 events (8 new), confidence: high
[check]   Navigate to April 2026                   Calendar advanced to April
[spinner] Extract events from April 2026           (active)
              Cleaning DOM...
              Calling extractor...
[circle]  Navigate to May 2026                     (pending)
[circle]  Extract events from May 2026             (pending)
```

Steps are seeded from the Planner's initial `planOutline`, updated via `planUpdate` when strategy changes, and auto-generated when the Planner omits step IDs. Sub-steps provide fine-grained progress within each step.
