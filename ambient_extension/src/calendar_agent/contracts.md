# Contracts & Types

These are the core data structures that flow between agents and the orchestrator. All agent inputs and outputs must conform to these types. They are defined as TypeScript interfaces in `types.ts` and validated at every boundary.

## State Object

The orchestrator maintains a single state object that persists across the entire extraction session. It is passed (in condensed form) to the Planner on every iteration.

```typescript
interface SessionState {
  // What we've collected so far
  extractedEvents: ExtractedEvent[];
  eventHashes: Set<string>;  // for O(1) deduplication lookups
  dateRangeCovered: { earliest: string; latest: string } | null;

  // What we know about the page
  reconnaissance: ReconnaissanceResult;
  discoveredUrlPattern: UrlPattern | null;
  discoveredApiEndpoint: ApiEndpoint | null;

  // Iteration tracking
  iterationCount: number;
  maxIterations: number; // hard circuit breaker, default 15
  actionHistory: ActionRecord[];
  planSteps: PlanStep[];  // structured plan displayed in UI

  // Status
  phase: "reconnaissance" | "extracting" | "navigating" | "complete" | "error";
  errorLog: string[];

  // Chrome extension context
  tabId: number;
  startTime: number;
  sessionTimeoutMs: number;
}
```

## Extracted Event

The standard event shape used across the entire extension — the same type used by file imports, calendar agent extraction, and the match/review UI. Defined in the extension's main `types.ts`.

```typescript
interface ExtractedEvent {
  event_type: 'full_potential_event_details' | 'not_an_event';
  summary: string;
  description?: string;
  location?: string;
  start?: {
    date?: string;      // YYYY-MM-DD for all-day events
    dateTime?: string;  // ISO 8601 for timed events
    timeZone?: string;  // IANA timezone, e.g. "America/New_York"
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  attendees?: string;   // comma-separated names
  htmlLink?: string;    // URL to event detail page
}
```

## Plan Steps

The orchestrator tracks a structured plan that is displayed in the sidepanel UI. Steps are seeded from the LLM's initial plan outline and updated as execution proceeds.

```typescript
type PlanStepStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped';

interface PlanStep {
  id: string;           // e.g., "recon", "extract_mar", "nav_apr"
  label: string;        // e.g., "Extract events from March 2026"
  status: PlanStepStatus;
  subSteps: SubStepEntry[];
  result?: string;      // summary once completed, e.g., "Found 12 events"
}

interface SubStepEntry {
  message: string;
  timestamp: string;    // HH:MM:SS
}
```

## Progress Updates (Background → Sidepanel)

Sent from the orchestrator to the sidepanel via message passing on every state change.

```typescript
interface CalendarAgentProgress {
  phase: SessionPhase;
  iterationCount: number;
  maxIterations: number;
  eventsFound: number;
  dateRangeCovered: { earliest: string; latest: string } | null;
  currentAction: string;
  activityLog: string[];      // flat log for debugging
  planSteps: PlanStep[];      // primary UI data source
  error?: string;
}
```

## Reconnaissance Result

Output of the reconnaissance phase — both the deterministic scan and the LLM assessment.

```typescript
interface ReconnaissanceResult {
  // From deterministic scan (no LLM needed)
  structured: {
    icsLinks: { url: string; linkText: string }[];
    webcalLinks: { url: string; linkText: string }[];
    jsonLdEvents: object[];
    detectedPlatform: string | null;
    platformParams?: PlatformParams;  // present when a registered platform is detected
  };

  // From LLM assessment of full DOM
  pageAssessment: {
    currentDateRange: { start: string; end: string } | null;
    visibleEventCount: number;
    calendarType: "monthly" | "weekly" | "list" | "agenda" | "single-event" | "unknown";
    controls: PageControl[];
    recommendedStrategy: "use-ics-download" | "use-api-endpoint" | "use-url-pattern" | "paginate-via-controls" | "static-extraction-only";
    strategyReasoning: string;
  };
}

interface PageControl {
  selector: string;
  elementDescription: string;
  inferredFunction: "next-page" | "previous-page" | "next-period" | "previous-period" | "date-picker" | "load-more" | "download" | "filter" | "unknown";
  confidence: "high" | "medium" | "low";
}
```

## Planner Reconnaissance Response

Returned only on the first Planner call. Includes the page assessment, the initial plan outline, and the first decision.

```typescript
interface PlannerReconnaissanceResponse {
  reconnaissance: PageAssessment;
  decision: PlannerDecision;
  discoveredUrlPattern?: UrlPattern;
  planOutline?: Array<{ id: string; label: string }>;  // LLM's initial plan
}
```

The `planOutline` is seeded into `state.planSteps` by the orchestrator. If the LLM omits it, the orchestrator builds plan steps dynamically from actions.

## URL and API Patterns

When the Planner discovers a URL pattern or API endpoint, it records it for reuse.

```typescript
interface UrlPattern {
  template: string;
  parameters: {
    name: string;
    currentValue: string;
    type: "month" | "year" | "date" | "offset" | "page";
  }[];
  example: string;
}

interface ApiEndpoint {
  url: string;
  method: "GET" | "POST";
  parameters: {
    name: string;
    currentValue: string;
    type: "start-date" | "end-date" | "limit" | "offset" | "other";
  }[];
  responseFormat: "json" | "ics" | "html" | "unknown";
}
```

## Planner Output

What the Planner returns on every iteration. Exactly one action, plus optional plan metadata.

```typescript
interface PlannerDecision {
  action: PlannerAction;
  reasoning: string;
  updatedPhase: SessionState["phase"];
  planStepId?: string;    // which plan step this action belongs to
  planUpdate?: Array<{ id: string; label: string }>;  // replaces remaining pending steps
}

type PlannerAction =
  | { type: "download-file"; url: string }
  | { type: "extract-current-page" }
  | { type: "extract-from-content"; content: string; contentType: "ics" | "json" | "html" }
  | { type: "interact"; instruction: InteractionInstruction }
  | { type: "navigate-to-url"; url: string }
  | { type: "fetch-api"; endpoint: ApiEndpoint; params: Record<string, string> }
  | { type: "done"; reason: string }
  | { type: "error"; reason: string };

interface InteractionInstruction {
  goal: string;
  steps: InteractionStep[];
}

interface InteractionStep {
  action: "click" | "type" | "scroll-down" | "wait";
  selector?: string;
  value?: string;
  waitMs?: number;
  description: string;
}
```

The `planStepId` tells the orchestrator which plan step to activate when executing this action. If omitted, the orchestrator infers the step (first pending step, or creates an ad-hoc one).

The `planUpdate` replaces all pending (not yet started) plan steps. Completed and active steps are preserved. Use this when the remaining plan needs to change (e.g., discovering more pages, switching strategy).

## Interactor Output

What the Interactor returns after executing instructions.

```typescript
interface InteractionResult {
  success: boolean;
  stepsCompleted: number;
  stepsAttempted: number;
  observation: string;
  newUrl: string | null;
  domChanged: boolean;
  error: string | null;
}
```

## Extractor Output

What the Extractor returns after parsing content.

```typescript
interface ExtractionResult {
  events: ExtractedEvent[];
  dateRange: { earliest: string; latest: string } | null;
  confidence: "high" | "medium" | "low";
  notes: string | null;
}
```

## Action Record

Stored in actionHistory for the Planner to reference on future iterations.

```typescript
interface ActionRecord {
  iteration: number;
  action: PlannerAction;
  reasoning: string;
  result: {
    newEventsFound: number;
    dateRangeAfter: { earliest: string; latest: string } | null;
    success: boolean;
    error: string | null;
  };
}
```

## Platform Extractors

When the deterministic scan detects a registered platform (currently Blackbaud), the orchestrator runs a zero-LLM deterministic extraction flow. See `platform-extractors.md` for the full architecture, interfaces, and guide to adding new platforms.

The system uses two registries:
- **Content script**: `PLATFORM_HANDLERS: PlatformContentHandler[]` — detection, param extraction, event parsing
- **Orchestrator**: `PLATFORM_CONFIGS: Record<string, PlatformOrchestratorConfig>` — URL construction

```typescript
interface PlatformParams {
  platformId: string;
  baseUrl: string;
  [key: string]: string;
}

interface PlatformContentHandler {
  id: string;
  detectionPatterns: RegExp[];
  extractParams(): PlatformParams | null;
  extractEvents(): ExtractedEvent[];
}

interface PlatformOrchestratorConfig {
  id: string;
  name: string;
  buildExtractionUrl(params: PlatformParams, dateRange: { sDate: string; eDate: string }): string;
}
```

Static extraction is triggered via the `CA_EXTRACT_STATIC` content script message, which looks up the correct handler by platform ID and calls `extractEvents()`.

If `CA_EXTRACT_STATIC` returns 0 events, the deterministic flow exits and the orchestrator falls through to the full LLM-driven flow from scratch (reconnaissance → Planner → main loop).

## Deduplication

Events are deduplicated by a deterministic hash computed in `hash.ts`:

```typescript
function computeEventHash(event: ExtractedEvent): string {
  const summary = (event.summary || '').toLowerCase();
  const startDate = event.start?.dateTime || event.start?.date || '';
  const location = (event.location || '').toLowerCase();
  const input = summary + startDate + location;
  return cyrb53(input).toString(36);
}
```

Before adding any event to `extractedEvents`, the orchestrator computes the hash and checks against `state.eventHashes` (a `Set<string>`). If the hash already exists, the event is skipped silently. The hash is not stored on the event itself — it's tracked separately in the session state.
