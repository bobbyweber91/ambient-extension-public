/**
 * Core types for the calendar agent system.
 * All agent inputs and outputs conform to these types.
 * Validated at every boundary between orchestrator and agents.
 */

import type { ExtractedEvent } from '../types';

// ============ Session State ============

export interface SessionState {
  extractedEvents: ExtractedEvent[];
  eventHashes: Set<string>;
  dateRangeCovered: DateRange | null;

  reconnaissance: ReconnaissanceResult;
  discoveredUrlPattern: UrlPattern | null;
  discoveredApiEndpoint: ApiEndpoint | null;

  iterationCount: number;
  maxIterations: number;
  actionHistory: ActionRecord[];
  planSteps: PlanStep[];

  phase: SessionPhase;
  errorLog: string[];

  tabId: number;
  startTime: number;
  sessionTimeoutMs: number;
}

export type SessionPhase =
  | 'reconnaissance'
  | 'extracting'
  | 'navigating'
  | 'complete'
  | 'error';

export interface DateRange {
  earliest: string;
  latest: string;
}

// ============ Reconnaissance ============

export interface ReconnaissanceResult {
  structured: StructuredScanResult;
  pageAssessment: PageAssessment | null;
}

export interface StructuredScanResult {
  icsLinks: { url: string; linkText: string }[];
  webcalLinks: { url: string; linkText: string }[];
  jsonLdEvents: object[];
  googleCalendarIds: string[];
  detectedPlatform: string | null;
  platformParams?: PlatformParams;
}

// ============ Platform Extractors ============

export interface PlatformParams {
  platformId: string;
  baseUrl: string;
  [key: string]: string;
}

export interface PlatformContentHandler {
  id: string;
  detectionPatterns: RegExp[];
  extractParams(): PlatformParams | null;
  extractEvents(): ExtractedEvent[];
}

export interface PlatformOrchestratorConfig {
  id: string;
  name: string;
  /** 'navigate-dom' loads a URL and parses the DOM, 'fetch-ics' downloads ICS feeds,
   *  'static-tables' extracts from tables already on the page. */
  extractionMethod?: 'navigate-dom' | 'fetch-ics' | 'static-tables';
  buildExtractionUrl(
    params: PlatformParams,
    dateRange: { sDate: string; eDate: string }
  ): string;
  buildIcsUrls?(params: PlatformParams): string[];
}

export interface PageAssessment {
  currentDateRange: DateRange | null;
  visibleEventCount: number;
  calendarType: 'monthly' | 'weekly' | 'list' | 'agenda' | 'single-event' | 'unknown';
  controls: PageControl[];
  recommendedStrategy: ExtractionStrategy;
  strategyReasoning: string;
}

export type ExtractionStrategy =
  | 'use-ics-download'
  | 'use-api-endpoint'
  | 'use-url-pattern'
  | 'paginate-via-controls'
  | 'static-extraction-only';

export interface PageControl {
  selector: string;
  elementDescription: string;
  inferredFunction: ControlFunction;
  confidence: 'high' | 'medium' | 'low';
}

export type ControlFunction =
  | 'next-page'
  | 'previous-page'
  | 'next-period'
  | 'previous-period'
  | 'date-picker'
  | 'load-more'
  | 'download'
  | 'filter'
  | 'unknown';

// ============ URL and API Patterns ============

export interface UrlPattern {
  template: string;
  parameters: UrlParameter[];
  example: string;
}

export interface UrlParameter {
  name: string;
  currentValue: string;
  type: 'month' | 'year' | 'date' | 'offset' | 'page';
}

export interface ApiEndpoint {
  url: string;
  method: 'GET' | 'POST';
  parameters: ApiParameter[];
  responseFormat: 'json' | 'ics' | 'html' | 'unknown';
}

export interface ApiParameter {
  name: string;
  currentValue: string;
  type: 'start-date' | 'end-date' | 'limit' | 'offset' | 'other';
}

// ============ Plan Steps ============

export type PlanStepStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped';

export interface PlanStep {
  id: string;
  label: string;
  status: PlanStepStatus;
  subSteps: SubStepEntry[];
  result?: string;
}

export interface SubStepEntry {
  message: string;
  timestamp: string;
}

// ============ Planner Output ============

export interface PlannerDecision {
  action: PlannerAction;
  reasoning: string;
  updatedPhase: SessionPhase;
  planStepId?: string;
  planUpdate?: Array<{ id: string; label: string }>;
}

export type PlannerAction =
  | { type: 'download-file'; url: string }
  | { type: 'extract-current-page' }
  | { type: 'extract-from-content'; content: string; contentType: 'ics' | 'json' | 'html' }
  | { type: 'interact'; instruction: InteractionInstruction }
  | { type: 'navigate-to-url'; url: string }
  | { type: 'fetch-api'; endpoint: ApiEndpoint; params: Record<string, string> }
  | { type: 'done'; reason: string }
  | { type: 'error'; reason: string };

export interface InteractionInstruction {
  goal: string;
  steps: InteractionStep[];
}

export interface InteractionStep {
  action: 'click' | 'type' | 'scroll-down' | 'wait';
  selector?: string;
  value?: string;
  waitMs?: number;
  description: string;
}

// ============ Interactor Output ============

export interface InteractionResult {
  success: boolean;
  stepsCompleted: number;
  stepsAttempted: number;
  observation: string;
  newUrl: string | null;
  domChanged: boolean;
  error: string | null;
}

// ============ Extractor Output ============

export interface ExtractionResult {
  events: ExtractedEvent[];
  dateRange: DateRange | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string | null;
}

// ============ Action Record ============

export interface ActionRecord {
  iteration: number;
  action: PlannerAction;
  reasoning: string;
  result: {
    newEventsFound: number;
    dateRangeAfter: DateRange | null;
    success: boolean;
    error: string | null;
  };
}

// ============ DOM Snapshot (lightweight) ============

export interface DomSnapshot {
  url: string;
  pageTitle: string;
  h1Text: string;
  calendarRegionText: string;
  eventElementCount: number;
  hasForwardNavControl: boolean;
}

// ============ Content Script Messages ============

export type CalendarAgentContentMessage =
  | { type: 'CA_GET_CLEANED_DOM' }
  | { type: 'CA_RUN_DETERMINISTIC_SCAN' }
  | { type: 'CA_EXECUTE_INTERACTION'; steps: InteractionStep[] }
  | { type: 'CA_GET_DOM_SNAPSHOT' }
  | { type: 'CA_EXTRACT_STATIC'; platformId?: string };

export type CalendarAgentContentResponse =
  | { type: 'dom'; html: string }
  | { type: 'scan-result'; result: StructuredScanResult }
  | { type: 'interaction-executed'; beforeSnapshot: DomSnapshot; afterSnapshot: DomSnapshot; newUrl: string | null }
  | { type: 'snapshot'; snapshot: DomSnapshot }
  | { type: 'error'; error: string };

// ============ Background Message Types ============

export interface StartCalendarAgentMessage {
  type: 'START_CALENDAR_AGENT';
  apiKey?: string;
  provider?: 'gemini_key' | 'ambient_ai';
}

export interface StopCalendarAgentMessage {
  type: 'STOP_CALENDAR_AGENT';
}

export interface GetCalendarAgentStatusMessage {
  type: 'GET_CALENDAR_AGENT_STATUS';
}

// ============ Progress Updates (Background → Sidepanel) ============

export interface CalendarAgentProgress {
  phase: SessionPhase;
  iterationCount: number;
  maxIterations: number;
  eventsFound: number;
  dateRangeCovered: DateRange | null;
  currentAction: string;
  activityLog: string[];
  planSteps: PlanStep[];
  error?: string;
  /** Set when all deterministic extraction paths have been exhausted
   *  and the agent is falling back to LLM-driven navigation. */
  unknownPlatformNotice?: boolean;
  /** The URL of the page being extracted (for submit-to-Ambient). */
  pageUrl?: string;
}

// ============ Planner Input (condensed state) ============

export interface PlannerInput {
  eventsCollected: number;
  dateRangeCovered: DateRange | null;
  reconnaissance: ReconnaissanceResult;
  discoveredUrlPattern: UrlPattern | null;
  discoveredApiEndpoint: ApiEndpoint | null;
  recentActions: ActionRecord[];
  iterationCount: number;
  maxIterations: number;
  errorCount: number;
  phase: SessionPhase;
  lastActionResult: unknown;
  currentUrl: string;
  planSteps?: Array<{ id: string; label: string; status: PlanStepStatus; result?: string }>;
}

// ============ First-call Planner Response (includes reconnaissance) ============

export interface PlannerReconnaissanceResponse {
  reconnaissance: PageAssessment;
  decision: PlannerDecision;
  discoveredUrlPattern?: UrlPattern;
  planOutline?: Array<{ id: string; label: string }>;
}
