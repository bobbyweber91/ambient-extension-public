# Orchestrator Instructions

## Role

The orchestrator is the deterministic glue code that manages the extraction session. It holds the state, routes data between agents, enforces hard constraints, and handles all non-LLM logic (deduplication, circuit breakers, file downloads, plan step tracking, progress reporting). It is NOT an LLM agent — it is procedural code.

## Session Lifecycle

```
initialize()
  → create deterministic "_recon" plan step
  → run deterministic scan (log sub-steps under _recon)
  → IF registered platform detected with valid params:
      → run deterministic platform flow (zero LLM calls)
      → IF succeeded: return
      → IF failed: fall through to LLM flow
  → (LLM flow):
      → call Planner for reconnaissance + first decision + planOutline
      → complete _recon step with summary
      → seed planSteps from LLM's planOutline
      → handle first decision
      → enter main loop

main loop:
  → call Planner with condensed state
  → apply planUpdate if returned (replace pending steps)
  → activate matching plan step
  → route to appropriate handler (log sub-steps during execution)
  → complete/fail the plan step with result
  → update state
  → check hard termination conditions
  → repeat

finalize()
  → mark remaining pending steps as skipped
  → deduplicate final event list
  → sort by start date
  → report final progress
  → return ExtractedEvent[] to caller
```

## Initialization

1. Create a deterministic `_recon` plan step and activate it.

2. Inject the content script into the active tab.

3. Run the deterministic scan via content script:
   - Query all `<a>` and `<link>` elements for hrefs ending in `.ics` or starting with `webcal://`
   - Query for `<link rel="alternate" type="text/calendar">`
   - Query for `<script type="application/ld+json">` and parse any that contain `@type: "Event"`
   - Check if the current URL matches known platform patterns (eventbrite.com, meetup.com, lu.ma, etc.)
   - Log findings as sub-steps under `_recon`

4. Clean the DOM (strip scripts/styles) and send to the Planner for reconnaissance.

5. The Planner returns:
   - `reconnaissance`: the page assessment
   - `decision`: the first action to take (with `planStepId`)
   - `discoveredUrlPattern`: optional URL pattern
   - `planOutline`: optional array of `{ id, label }` for the high-level plan

6. Complete the `_recon` step with a summary (calendar type, event count, strategy).

7. Seed `state.planSteps` from `planOutline`. If the LLM returned no outline, steps are built dynamically as actions arrive.

8. Handle the first decision (which activates the first plan step from the outline).

## Platform Deterministic Flow

When the deterministic scan detects a registered platform with valid parameters, the orchestrator looks up the matching `PlatformOrchestratorConfig` and bypasses the LLM entirely. See `platform-extractors.md` for the full architecture and how to add new platforms.

The generic `runDeterministicFlow(config, params, reconStepId)` method:

1. **Compute date range.** Start of current month through the next June 30 (current year if before July, next year if July or later).

2. **Build extraction URL.** Calls `config.buildExtractionUrl(params, dateRange)` — each platform defines how to construct its optimal list-view URL from the parameters extracted during the scan.

3. **Navigate and extract.** Navigate the tab to the constructed URL, re-inject the content script, send `CA_EXTRACT_STATIC`. The content script finds the matching `PlatformContentHandler` by ID and calls `extractEvents()`.

4. **Full LLM fallback.** If static extraction returns 0 events or navigation fails, `runDeterministicFlow` returns `false`. The orchestrator falls through to the standard LLM-driven flow from scratch.

This path typically completes in ~3 seconds with zero LLM calls and zero token cost.

### Registered platforms

| Platform | ID | Detection | Notes |
|----------|-----|-----------|-------|
| Blackbaud | `blackbaud` | `myschoolcdn.com` or `blackbaud` in URL/page | School calendars, list/grid views, hidden input params |

### Date range logic

The end date is always the next June 30:
- If current month is January–June → June 30 of current year
- If current month is July–December → June 30 of next year

This captures the full remaining school year. School calendars rarely have events over summer, so June 30 is a safe upper bound.

## Initial State

```typescript
{
  extractedEvents: [],
  eventHashes: new Set<string>(),
  dateRangeCovered: null,
  reconnaissance: { structured: scanResults, pageAssessment: null },
  discoveredUrlPattern: null,
  discoveredApiEndpoint: null,
  iterationCount: 0,
  maxIterations: 15,
  actionHistory: [],
  planSteps: [],  // populated during initialization
  phase: "reconnaissance",
  errorLog: [],
  tabId: <active tab>,
  startTime: Date.now(),
  sessionTimeoutMs: 120_000
}
```

## Main Loop: Action Routing

On each iteration, receive a `PlannerDecision` and route based on `action.type`. Before executing, activate the matching plan step (via `planStepId` from the planner, or infer from action type). During execution, log sub-steps under the active plan step. After execution, complete or fail the step with a result string.

### `extract-current-page`
1. Log sub-step: "Cleaning DOM..."
2. Get the current cleaned DOM.
3. Log sub-step: "Calling extractor..."
4. Send to Extractor.
5. Receive `ExtractionResult`.
6. Deduplicate: for each event, compute hash via `computeEventHash`, skip if in `eventHashes`.
7. Append new events to `extractedEvents`, add hashes to `eventHashes`.
8. Update `dateRangeCovered`.
9. Complete plan step with result: "Found N events (M new), confidence: high"

### `extract-from-content`
1. Log sub-step: "Parsing {contentType} content..."
2. Pass the provided `content` and `contentType` to the Extractor.
3. Same deduplication and state update as above.

### `download-file`
1. Log sub-step: "Downloading: {url}"
2. Fetch the URL. Detect content type from headers or extension.
3. Log sub-step: "Parsing {contentType} content..."
4. Route to Extractor.
5. If download fails: log error, fail plan step with error message.

### `interact`
1. Log sub-step: "Goal: {instruction.goal}"
2. Pass the `InteractionInstruction` to the Interactor.
3. If URL changed, log sub-step with new URL.
4. Complete/fail step based on `InteractionResult.success`.

### `navigate-to-url`
1. Log sub-step: "Navigating to: {url}"
2. Navigate the tab and wait for load.
3. Log sub-step: "Re-injecting content script..."
4. Re-inject content script.
5. Log sub-step: "Re-scanning page..."
6. Re-run deterministic scan.
7. Complete step with "Navigation complete".

### `fetch-api`
1. Log sub-step: "Fetching: {endpoint.url}"
2. Make the HTTP request.
3. Log sub-step: "Parsing {contentType} response..."
4. Route response to Extractor.

### `done`
1. Complete the plan step (if any) with the reason.
2. Exit the main loop.

### `error`
1. Fail the plan step (if any) with the error.
2. Exit the main loop.

## Plan Step Management

The orchestrator manages plan steps through these operations:

**`addPlanStep(id, label)`** — Adds a new pending step if one with that ID doesn't already exist.

**`activatePlanStep(id)`** — Sets the step to `active`. If the step doesn't exist, creates it first. Updates `activePlanStepId` tracking.

**`completePlanStep(id, result)`** — Sets the step to `completed` with a result string.

**`failPlanStep(id, error)`** — Sets the step to `failed` with an error string.

**`logSubStep(message)`** — Appends a timestamped sub-step entry to the currently active plan step and reports progress.

**`applyPlanUpdate(newSteps)`** — Called when the planner returns a `planUpdate`. Keeps all completed, failed, and active steps. Replaces all pending steps with the new ones.

**`inferPlanStepId(action)`** — When the planner doesn't specify `planStepId`, the orchestrator tries to find a matching pending step (takes the first one) or creates an ad-hoc step with a label derived from the action type.

### Dynamic step creation

When the planner omits `planStepId` and no pending steps remain, the orchestrator creates an ad-hoc step with an auto-generated ID (`_action_{iteration}`) and a label based on the action type. This ensures every action has a corresponding plan step in the UI, even when the LLM doesn't cooperate.

### Finalization step cleanup

When the session ends, all remaining `pending` steps are marked `skipped`, and any `active` step is marked `completed` with "Session ended".

## Hard Termination Conditions

Check these AFTER every action, BEFORE calling the Planner again:

- `iterationCount >= maxIterations` → stop immediately, finalize.
- Total session time exceeds `sessionTimeoutMs` → stop, finalize.
- `errorLog.length >= 5` → stop, finalize.
- Same action and result two iterations in a row → stop (infinite loop detected).

When hard-terminating, set `phase: "complete"` and proceed to finalization.

## State Update Rules

After every action:
- Increment `iterationCount`.
- Append an `ActionRecord` to `actionHistory`.
- Update `extractedEvents`, `eventHashes`, and `dateRangeCovered` if extraction occurred.
- Update `discoveredUrlPattern` or `discoveredApiEndpoint` if the Planner set them.
- Update `phase` from `PlannerDecision.updatedPhase`.

## Deduplication

Before adding any event to `extractedEvents`:
1. Compute hash via `computeEventHash(event)` — a deterministic hash of `lowercase(summary) + (start.dateTime || start.date) + lowercase(location)`.
2. Check against `state.eventHashes` (a `Set<string>`).
3. If present, skip silently. If new, add the event and the hash.

## Preparing Planner Input

When calling the Planner, send a condensed version of state:

```typescript
{
  eventsCollected: state.extractedEvents.length,
  dateRangeCovered: state.dateRangeCovered,
  reconnaissance: state.reconnaissance,
  discoveredUrlPattern: state.discoveredUrlPattern,
  discoveredApiEndpoint: state.discoveredApiEndpoint,
  recentActions: state.actionHistory.slice(-5),
  iterationCount: state.iterationCount,
  maxIterations: state.maxIterations,
  errorCount: state.errorLog.length,
  phase: state.phase,
  lastActionResult: <raw result from last agent call>,
  currentUrl: <current tab URL>
}
```

## Progress Reporting

The orchestrator calls `reportProgress` after every meaningful state change. This sends a `CalendarAgentProgress` object to the sidepanel, which includes the full `planSteps` array. The sidepanel renders this as an interactive tree showing each step's status, sub-steps, and results.

## Chrome Extension Specifics

The orchestrator runs in the extension's **service worker**. It communicates with:
- **Content scripts** injected into the active tab for DOM access, clicking, scrolling, and observation.
- **The LLM API** for Planner, Interactor (observation generation), and Extractor calls.
- **The sidepanel** for progress reporting via `chrome.runtime.sendMessage`.

Communication between service worker and content scripts uses `chrome.tabs.sendMessage` / `chrome.runtime.onMessage`:

```typescript
type ContentScriptMessage =
  | { type: "CA_GET_CLEANED_DOM" }
  | { type: "CA_RUN_DETERMINISTIC_SCAN" }
  | { type: "CA_EXECUTE_INTERACTION"; steps: InteractionStep[] }
  | { type: "CA_GET_DOM_SNAPSHOT" }
  | { type: "CA_EXTRACT_STATIC" }  // platform-specific static DOM extraction (e.g. Blackbaud)

type ContentScriptResponse =
  | { type: "dom"; html: string }
  | { type: "scan-result"; result: StructuredScanResult }
  | { type: "interaction-executed"; beforeSnapshot: DomSnapshot; afterSnapshot: DomSnapshot; newUrl: string | null }
  | { type: "snapshot"; snapshot: DomSnapshot }
  | { type: "static-events"; events: ExtractedEvent[] }  // response to CA_EXTRACT_STATIC
  | { type: "error"; error: string }
```

## Error Handling

- Network errors (download, API fetch): log to `errorLog`, fail plan step, record in `actionHistory`. The Planner handles fallback.
- Extractor returns 0 events with low confidence: record as a "soft failure". Not an error, but the Planner needs to know.
- Interactor reports failure: fail plan step, record in `actionHistory`. The Planner may try an alternative.
- LLM call fails (timeout, rate limit, malformed response): retry once. If still fails, log error and terminate.
- LLM returns invalid JSON: attempt to extract JSON from the response (strip markdown fences). If still invalid, log error and terminate.
