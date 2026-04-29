/**
 * Orchestrator — deterministic glue code that manages the extraction session.
 * Holds state, routes data between agents, enforces hard constraints,
 * handles deduplication, circuit breakers, and progress reporting.
 * Runs in the background service worker.
 */

import type { ExtractedEvent } from '../types';
import type {
  SessionState,
  SessionPhase,
  DateRange,
  ActionRecord,
  PlannerAction,
  PlannerDecision,
  ExtractionResult,
  InteractionResult,
  InteractionInstruction,
  InteractionStep,
  CalendarAgentProgress,
  ReconnaissanceResult,
  StructuredScanResult,
  PlanStep,
  PlatformOrchestratorConfig,
  PlatformParams,
} from './types';
import { computeEventHash } from './hash';
import { callPlannerReconnaissance, callPlanner, buildPlannerInput } from './planner';
import { extractFromDom, extractFromContent } from './extractor';
import { executeAndAssess } from './interactor';
import { parseIcsContent } from './icsParser';
import { getEvents } from '../lib/calendarApi';

const DEFAULT_MAX_ITERATIONS = 15;
const DEFAULT_SESSION_TIMEOUT_MS = 600_000;
const MAX_ERRORS = 5;

// ============ Platform Extractor Configs ============

const PLATFORM_CONFIGS: Record<string, PlatformOrchestratorConfig> = {
  blackbaud: {
    id: 'blackbaud',
    name: 'Blackbaud',
    buildExtractionUrl(params: PlatformParams, dateRange: { sDate: string; eDate: string }): string {
      return `${params.baseUrl}?sDate=${dateRange.sDate}&eDate=${dateRange.eDate}&showAll=1&tab=0&ec=${encodeURIComponent(params.ec || '')}`;
    },
  },
  finalsite: {
    id: 'finalsite',
    name: 'Finalsite',
    extractionMethod: 'fetch-ics',
    buildExtractionUrl(params: PlatformParams): string {
      const ids = (params.calendarIds || '').split(',').map(s => s.trim()).filter(Boolean);
      if (params.calendarsEnabled === 'true') {
        const qs = ids.map(id => `calendar_ids=${id}`).join('&');
        return `${params.baseUrl}/fs/calendar-manager/events.ics?${qs}`;
      }
      return `${params.baseUrl}/calendar/calendar_${ids[0]}.ics`;
    },
    buildIcsUrls(params: PlatformParams): string[] {
      const ids = (params.calendarIds || '').split(',').map(s => s.trim()).filter(Boolean);
      const urls: string[] = [];

      // Legacy per-calendar ICS (works on most sites)
      for (const id of ids) {
        urls.push(`${params.baseUrl}/calendar/calendar_${id}.ics`);
      }

      // New-style combined endpoint (works when calendarsEnabled = true)
      if (params.calendarsEnabled === 'true') {
        const qs = ids.map(id => `calendar_ids=${id}`).join('&');
        urls.push(`${params.baseUrl}/fs/calendar-manager/events.ics?${qs}`);
      }

      return urls;
    },
  },
};

export type ProgressCallback = (progress: CalendarAgentProgress) => void;

/**
 * Manages a single calendar agent extraction session.
 */
export class CalendarAgentSession {
  private state: SessionState;
  private onProgress: ProgressCallback;
  private apiKey: string | undefined;
  private provider: 'gemini_key' | 'ambient_ai';
  private activityLog: string[] = [];
  private aborted = false;
  private activePlanStepId: string | null = null;
  private unknownPlatformNotice = false;
  private pageUrl: string | undefined;

  constructor(
    tabId: number,
    apiKey: string | undefined,
    provider: 'gemini_key' | 'ambient_ai',
    onProgress: ProgressCallback
  ) {
    this.apiKey = apiKey;
    this.provider = provider;
    this.onProgress = onProgress;
    console.log(`[CA:orchestrator] Session created — tabId=${tabId}, provider=${provider}, hasApiKey=${!!apiKey}`);

    this.state = {
      extractedEvents: [],
      eventHashes: new Set<string>(),
      dateRangeCovered: null,
      reconnaissance: { structured: { icsLinks: [], webcalLinks: [], jsonLdEvents: [], googleCalendarIds: [], detectedPlatform: null }, pageAssessment: null },
      discoveredUrlPattern: null,
      discoveredApiEndpoint: null,
      iterationCount: 0,
      maxIterations: DEFAULT_MAX_ITERATIONS,
      actionHistory: [],
      planSteps: [],
      phase: 'reconnaissance',
      errorLog: [],
      tabId,
      startTime: Date.now(),
      sessionTimeoutMs: DEFAULT_SESSION_TIMEOUT_MS,
    };
  }

  abort(): void {
    this.aborted = true;
  }

  getExtractedEvents(): ExtractedEvent[] {
    return this.state.extractedEvents;
  }

  getPhase(): SessionPhase {
    return this.state.phase;
  }

  async run(): Promise<ExtractedEvent[]> {
    console.log('[CA:orchestrator] run() starting');
    try {
      await this.initialize();
      if (this.state.phase === 'complete' || this.state.phase === 'error') {
        console.log(`[CA:orchestrator] Initialization ended with phase=${this.state.phase}, skipping main loop`);
        return this.finalize();
      }
      console.log('[CA:orchestrator] Entering main loop');
      await this.mainLoop();
    } catch (e) {
      console.error('[CA:orchestrator] Top-level run() error:', e);
      this.log(`Session error: ${(e as Error).message}`);
      this.state.phase = 'error';
      this.state.errorLog.push((e as Error).message);
    }
    return this.finalize();
  }

  // ============ Initialization ============

  private async initialize(): Promise<void> {
    console.log('[CA:orchestrator] === INITIALIZATION START ===');
    const reconStepId = '_recon';
    this.addPlanStep(reconStepId, 'Scanning and analyzing page');
    this.activatePlanStep(reconStepId);

    this.logSubStep('Injecting content script...');
    await this.injectContentScript();
    console.log('[CA:orchestrator] Content script injected');

    this.logSubStep('Scanning for structured data...');
    const scanResult = await this.sendContentMessage<StructuredScanResult>('CA_RUN_DETERMINISTIC_SCAN');
    this.state.reconnaissance.structured = scanResult;
    console.log('[CA:orchestrator] Deterministic scan result:', JSON.stringify(scanResult, null, 2));

    if (scanResult.detectedPlatform) {
      this.logSubStep(`Detected platform: ${scanResult.detectedPlatform}`);
    }
    if (scanResult.icsLinks.length > 0) {
      this.logSubStep(`Found ${scanResult.icsLinks.length} ICS link(s)`);
    }
    if (scanResult.jsonLdEvents.length > 0) {
      this.logSubStep(`Found ${scanResult.jsonLdEvents.length} JSON-LD event(s)`);
    }
    if (scanResult.googleCalendarIds.length > 0) {
      this.logSubStep(`Found ${scanResult.googleCalendarIds.length} embedded Google Calendar(s)`);
    }

    // Platform-specific deterministic flow — skip LLM entirely
    const platformConfig = scanResult.detectedPlatform
      ? PLATFORM_CONFIGS[scanResult.detectedPlatform]
      : undefined;
    if (platformConfig && scanResult.platformParams) {
      console.log(`[CA:orchestrator] ${platformConfig.name} detected with params — using deterministic flow`);
      this.reportProgress(`Reading ${platformConfig.name} calendar...`);
      const succeeded = await this.runDeterministicFlow(platformConfig, scanResult.platformParams, reconStepId);
      if (succeeded) return;
      console.log('[CA:orchestrator] Deterministic flow yielded 0 events — falling back to full LLM flow');
      this.logSubStep('Static extraction found nothing, switching to AI-driven flow...');
    }

    // Google Calendar embeds found — fetch events via the Calendar API
    if (scanResult.googleCalendarIds.length > 0) {
      console.log(`[CA:orchestrator] ${scanResult.googleCalendarIds.length} Google Calendar ID(s) found — trying Calendar API fetch`);
      this.reportProgress('Fetching events from embedded Google Calendar...');
      const succeeded = await this.runGoogleCalendarApiFetchFlow(scanResult.googleCalendarIds, reconStepId);
      if (succeeded) return;
      console.log('[CA:orchestrator] Google Calendar API fetch yielded 0 events — falling back');
      this.logSubStep('Calendar API fetch found nothing...');
    }

    // Scan-discovered ICS links (from <a> tags, <link> tags, etc.) — fetch and parse directly
    if (scanResult.icsLinks.length > 0) {
      console.log(`[CA:orchestrator] ${scanResult.icsLinks.length} scan-discovered ICS link(s) — trying direct fetch`);
      this.reportProgress('Downloading calendar feed...');
      const succeeded = await this.runScanIcsLinkFetchFlow(scanResult.icsLinks, reconStepId);
      if (succeeded) return;
      console.log('[CA:orchestrator] Scan ICS link fetch yielded 0 events — falling back');
      this.logSubStep('ICS download found nothing...');
    }

    // JSON-LD events found in page markup — map directly to ExtractedEvent without LLM
    if (scanResult.jsonLdEvents.length > 0) {
      console.log(`[CA:orchestrator] ${scanResult.jsonLdEvents.length} JSON-LD event(s) — mapping directly`);
      this.reportProgress('Reading calendar events from page...');
      const succeeded = await this.runJsonLdFlow(scanResult.jsonLdEvents, reconStepId);
      if (succeeded) return;
      console.log('[CA:orchestrator] JSON-LD mapping yielded 0 usable events — falling back');
      this.logSubStep('JSON-LD events had no usable data...');
    }

    // webcal:// links — convert to https and fetch as ICS
    if (scanResult.webcalLinks.length > 0) {
      console.log(`[CA:orchestrator] ${scanResult.webcalLinks.length} webcal link(s) — fetching as ICS`);
      this.reportProgress('Downloading calendar subscription...');
      const succeeded = await this.runWebcalLinkFlow(scanResult.webcalLinks, reconStepId);
      if (succeeded) return;
      console.log('[CA:orchestrator] webcal fetch yielded 0 events — falling back');
      this.logSubStep('webcal download found nothing...');
    }

    const tab = await chrome.tabs.get(this.state.tabId);
    const currentUrl = tab.url || '';

    this.unknownPlatformNotice = true;
    this.pageUrl = currentUrl;
    this.reportProgress('No known calendar system detected — switching to AI-driven extraction');

    this.logSubStep('Analyzing page structure...');
    const cleanedDom = await this.sendContentMessage<string>('CA_GET_CLEANED_DOM');
    console.log(`[CA:orchestrator] Cleaned DOM size: ${cleanedDom.length} chars`);
    console.log(`[CA:orchestrator] Current URL: ${currentUrl}`);

    this.logSubStep('AI is assessing the page and creating a plan...');
    this.reportProgress('Planning...');
    console.log('[CA:orchestrator] Calling planner reconnaissance...');
    const reconResponse = await callPlannerReconnaissance(
      cleanedDom,
      scanResult,
      currentUrl,
      this.apiKey,
      this.provider
    );
    console.log('[CA:orchestrator] Planner reconnaissance response:', JSON.stringify({
      calendarType: reconResponse.reconnaissance?.calendarType,
      visibleEventCount: reconResponse.reconnaissance?.visibleEventCount,
      recommendedStrategy: reconResponse.reconnaissance?.recommendedStrategy,
      strategyReasoning: reconResponse.reconnaissance?.strategyReasoning,
      controlsCount: reconResponse.reconnaissance?.controls?.length,
      hasUrlPattern: !!reconResponse.discoveredUrlPattern,
      planOutline: reconResponse.planOutline,
      firstDecision: { type: reconResponse.decision?.action?.type, planStepId: reconResponse.decision?.planStepId, reasoning: reconResponse.decision?.reasoning },
    }, null, 2));

    this.state.reconnaissance.pageAssessment = reconResponse.reconnaissance;
    if (reconResponse.discoveredUrlPattern) {
      this.state.discoveredUrlPattern = reconResponse.discoveredUrlPattern;
      console.log('[CA:orchestrator] Discovered URL pattern:', JSON.stringify(reconResponse.discoveredUrlPattern, null, 2));
    }

    const assessment = reconResponse.reconnaissance;
    const summaryParts: string[] = [];
    summaryParts.push(`${assessment.calendarType} view`);
    summaryParts.push(`~${assessment.visibleEventCount} events visible`);
    summaryParts.push(`strategy: ${assessment.recommendedStrategy}`);
    this.completePlanStep(reconStepId, summaryParts.join(', '));

    if (reconResponse.planOutline && reconResponse.planOutline.length > 0) {
      console.log(`[CA:orchestrator] Seeding ${reconResponse.planOutline.length} plan steps from LLM outline`);
      for (const step of reconResponse.planOutline) {
        this.addPlanStep(step.id, step.label);
      }
    } else {
      console.log('[CA:orchestrator] No planOutline from LLM, steps will be created dynamically');
    }

    console.log('[CA:orchestrator] === INITIALIZATION COMPLETE ===');
    console.log('[CA:orchestrator] Plan steps:', this.state.planSteps.map(s => `${s.id}: "${s.label}" [${s.status}]`));

    this.state.phase = reconResponse.decision.updatedPhase;
    await this.handleDecision(reconResponse.decision);
  }

  /**
   * Generic deterministic extraction for recognized platforms.
   * No LLM calls needed. Two modes:
   * - navigate-dom: navigates to a constructed URL, parses DOM (Blackbaud)
   * - fetch-ics: downloads ICS feed(s) directly, parses with ical.js (Finalsite)
   */
  private async runDeterministicFlow(
    config: PlatformOrchestratorConfig,
    params: PlatformParams,
    reconStepId: string
  ): Promise<boolean> {
    if (params.extractionMethod === 'static-tables') {
      return this.runStaticTableFlow(config, reconStepId);
    }
    if (config.extractionMethod === 'fetch-ics') {
      return this.runIcsFetchFlow(config, params, reconStepId);
    }
    return this.runNavigateDomFlow(config, params, reconStepId);
  }

  private async runStaticTableFlow(
    config: PlatformOrchestratorConfig,
    reconStepId: string
  ): Promise<boolean> {
    this.completePlanStep(reconStepId, `${config.name} calendar detected — reading events`);

    const extractStepId = '_platform_extract_tables';
    this.addPlanStep(extractStepId, `Reading ${config.name} calendar events`);
    this.activatePlanStep(extractStepId);
    this.reportProgress(`Reading ${config.name} calendar events...`);

    const events = await this.sendContentMessage<any[]>('CA_EXTRACT_STATIC', { platformId: config.id });
    console.log(`[CA:orchestrator] ${config.name} table extraction: ${events.length} events`);

    if (events.length > 0) {
      const result: ExtractionResult = {
        events,
        dateRange: this.computeDateRange(events),
        confidence: 'high',
        notes: `Static table extraction: ${events.length} events from ${config.name} page`,
      };
      const newCount = this.mergeExtractedEvents(result);
      this.completePlanStep(extractStepId, `Found ${events.length} events (${newCount} new)`);
      this.state.phase = 'complete';
      console.log(`[CA:orchestrator] ${config.name} static table flow complete: ${this.state.extractedEvents.length} unique events`);
      return true;
    }

    this.failPlanStep(extractStepId, 'Table extraction returned 0 events');
    console.log(`[CA:orchestrator] ${config.name} table extraction returned 0 events — falling back`);
    return false;
  }

  /**
   * Fetch events from embedded Google Calendars via the Calendar API.
   * Uses the user's OAuth token + the existing getEvents() helper.
   */
  private async runGoogleCalendarApiFetchFlow(
    calendarIds: string[],
    reconStepId: string
  ): Promise<boolean> {
    this.completePlanStep(reconStepId, `Found ${calendarIds.length} embedded Google Calendar(s)`);

    const fetchStepId = '_gcal_api_fetch';
    this.addPlanStep(fetchStepId, `Fetching events from embedded Google Calendar`);
    this.activatePlanStep(fetchStepId);
    this.reportProgress('Fetching events from embedded Google Calendar...');

    const now = new Date();
    const timeMin = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const timeMax = new Date(now.getFullYear(), now.getMonth() + 12, 0).toISOString();

    let totalEvents = 0;
    let successCount = 0;

    for (const calId of calendarIds) {
      try {
        this.logSubStep(`Fetching calendar: ${calId}`);
        const calEvents = await getEvents(calId, timeMin, timeMax, 250, false);
        console.log(`[CA:orchestrator] Google Calendar API: ${calEvents.length} events from ${calId}`);

        if (calEvents.length > 0) {
          const extracted: ExtractedEvent[] = calEvents.map(ev => ({
            event_type: 'full_potential_event_details' as const,
            summary: ev.summary || '(No title)',
            description: ev.description || '',
            location: ev.location,
            start: ev.start,
            end: ev.end,
          }));

          const result: ExtractionResult = {
            events: extracted,
            dateRange: this.computeDateRange(extracted),
            confidence: 'high',
            notes: `Google Calendar API: ${extracted.length} events from ${calId}`,
          };
          const newCount = this.mergeExtractedEvents(result);
          totalEvents += extracted.length;
          successCount++;
          this.logSubStep(`${extracted.length} events fetched (${newCount} new)`);
        }
      } catch (e) {
        console.warn(`[CA:orchestrator] Google Calendar API error for ${calId}:`, e);
        this.logSubStep(`Error fetching ${calId}: ${(e as Error).message}`);
      }
    }

    if (totalEvents > 0) {
      this.completePlanStep(fetchStepId, `${totalEvents} events from ${successCount} calendar(s), ${this.state.extractedEvents.length} unique total`);
      this.state.phase = 'complete';
      console.log(`[CA:orchestrator] Google Calendar API fetch complete: ${this.state.extractedEvents.length} unique events`);
      return true;
    }

    this.failPlanStep(fetchStepId, 'All Google Calendar feeds returned 0 events');
    console.log(`[CA:orchestrator] Google Calendar API fetch returned 0 events — falling back`);
    return false;
  }

  /**
   * Fetch and parse ICS links discovered during the page scan (from <a> tags, <link> elements, etc.).
   */
  private async runScanIcsLinkFetchFlow(
    icsLinks: Array<{ url: string; linkText: string }>,
    reconStepId: string
  ): Promise<boolean> {
    this.completePlanStep(reconStepId, `Found ${icsLinks.length} calendar feed(s) on page`);

    const fetchStepId = '_scan_ics_fetch';
    this.addPlanStep(fetchStepId, 'Downloading calendar feed');
    this.activatePlanStep(fetchStepId);
    this.reportProgress('Downloading calendar feed...');

    let totalEvents = 0;
    let successCount = 0;

    for (const link of icsLinks) {
      try {
        this.logSubStep(`Fetching: ${link.linkText || link.url}`);
        const response = await fetch(link.url);
        if (!response.ok) {
          console.warn(`[CA:orchestrator] ICS fetch failed: HTTP ${response.status} for ${link.url}`);
          this.logSubStep(`HTTP ${response.status} — skipping`);
          continue;
        }

        const icsText = await response.text();
        if (!icsText.includes('BEGIN:VEVENT')) {
          console.log(`[CA:orchestrator] ICS has no VEVENTs: ${link.url} (${icsText.length} bytes)`);
          this.logSubStep('No events in this feed — skipping');
          continue;
        }

        const events = parseIcsContent(icsText);
        console.log(`[CA:orchestrator] Parsed ${events.length} events from ${link.url}`);

        if (events.length > 0) {
          const result: ExtractionResult = {
            events,
            dateRange: this.computeDateRange(events),
            confidence: 'high',
            notes: `ICS feed: ${events.length} events from ${link.linkText || link.url}`,
          };
          const newCount = this.mergeExtractedEvents(result);
          totalEvents += events.length;
          successCount++;
          this.logSubStep(`${events.length} events parsed (${newCount} new)`);
        }
      } catch (e) {
        console.warn(`[CA:orchestrator] ICS fetch error for ${link.url}:`, e);
        this.logSubStep(`Error: ${(e as Error).message}`);
      }
    }

    if (totalEvents > 0) {
      this.completePlanStep(fetchStepId, `${totalEvents} events from ${successCount} feed(s), ${this.state.extractedEvents.length} unique total`);
      this.state.phase = 'complete';
      console.log(`[CA:orchestrator] Scan ICS fetch complete: ${this.state.extractedEvents.length} unique events`);
      return true;
    }

    this.failPlanStep(fetchStepId, 'All ICS feeds returned 0 events');
    console.log(`[CA:orchestrator] Scan ICS fetch returned 0 events — falling back`);
    return false;
  }

  private async runIcsFetchFlow(
    config: PlatformOrchestratorConfig,
    params: PlatformParams,
    reconStepId: string
  ): Promise<boolean> {
    this.completePlanStep(reconStepId, `${config.name} calendar detected — downloading calendar feed`);

    const urls = config.buildIcsUrls?.(params) ?? [config.buildExtractionUrl(params, { sDate: '', eDate: '' })];
    console.log(`[CA:orchestrator] ${config.name} ICS URLs to fetch:`, urls);

    const fetchStepId = '_platform_fetch_ics';
    this.addPlanStep(fetchStepId, `Downloading ${config.name} calendar feed`);
    this.activatePlanStep(fetchStepId);
    this.reportProgress(`Downloading ${config.name} calendar feed...`);

    let totalEvents = 0;
    let successCount = 0;

    for (const url of urls) {
      try {
        this.logSubStep(`Fetching: ${url}`);
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`[CA:orchestrator] ICS fetch failed: HTTP ${response.status} for ${url}`);
          this.logSubStep(`HTTP ${response.status} — skipping`);
          continue;
        }

        const icsText = await response.text();
        if (!icsText.includes('BEGIN:VEVENT')) {
          console.log(`[CA:orchestrator] ICS has no VEVENTs: ${url} (${icsText.length} bytes)`);
          this.logSubStep('No events in this feed — skipping');
          continue;
        }

        const events = parseIcsContent(icsText);
        console.log(`[CA:orchestrator] Parsed ${events.length} events from ${url}`);

        if (events.length > 0) {
          const result: ExtractionResult = {
            events,
            dateRange: this.computeDateRange(events),
            confidence: 'high',
            notes: `ICS feed: ${events.length} events from ${url}`,
          };
          const newCount = this.mergeExtractedEvents(result);
          totalEvents += events.length;
          successCount++;
          this.logSubStep(`${events.length} events parsed (${newCount} new)`);
        }
      } catch (e) {
        console.warn(`[CA:orchestrator] ICS fetch error for ${url}:`, e);
        this.logSubStep(`Error: ${(e as Error).message}`);
      }
    }

    if (totalEvents > 0) {
      this.completePlanStep(fetchStepId, `${totalEvents} events from ${successCount} feed(s), ${this.state.extractedEvents.length} unique total`);
      this.state.phase = 'complete';
      console.log(`[CA:orchestrator] ${config.name} ICS fetch flow complete: ${this.state.extractedEvents.length} unique events`);
      return true;
    }

    this.failPlanStep(fetchStepId, 'All ICS feeds returned 0 events');
    console.log(`[CA:orchestrator] ${config.name} ICS fetch flow returned 0 events — falling back`);
    return false;
  }

  /**
   * Map schema.org JSON-LD Event objects directly to ExtractedEvent[].
   * Zero LLM calls — pure field mapping.
   */
  private async runJsonLdFlow(
    jsonLdEvents: object[],
    reconStepId: string
  ): Promise<boolean> {
    this.completePlanStep(reconStepId, `Found ${jsonLdEvents.length} event(s) in page data`);

    const stepId = '_jsonld_map';
    this.addPlanStep(stepId, 'Reading calendar events from page');
    this.activatePlanStep(stepId);
    this.reportProgress('Reading calendar events from page...');

    const events: ExtractedEvent[] = [];
    for (const obj of jsonLdEvents) {
      try {
        const ld = obj as Record<string, any>;
        const summary = ld.name || ld.headline || '';
        if (!summary) continue;

        const event: ExtractedEvent = {
          event_type: 'full_potential_event_details',
          summary,
          description: ld.description || '',
          location: typeof ld.location === 'string'
            ? ld.location
            : ld.location?.name || ld.location?.address?.streetAddress || undefined,
          htmlLink: ld.url || undefined,
        };

        if (ld.startDate) {
          event.start = ld.startDate.length <= 10
            ? { date: ld.startDate }
            : { dateTime: new Date(ld.startDate).toISOString() };
        }
        if (ld.endDate) {
          event.end = ld.endDate.length <= 10
            ? { date: ld.endDate }
            : { dateTime: new Date(ld.endDate).toISOString() };
        }

        events.push(event);
      } catch (e) {
        console.warn('[CA:orchestrator] Skipping malformed JSON-LD event:', e);
      }
    }

    console.log(`[CA:orchestrator] JSON-LD mapped ${events.length} events from ${jsonLdEvents.length} objects`);

    if (events.length > 0) {
      const result: ExtractionResult = {
        events,
        dateRange: this.computeDateRange(events),
        confidence: 'high',
        notes: `JSON-LD: ${events.length} events mapped from page markup`,
      };
      const newCount = this.mergeExtractedEvents(result);
      this.completePlanStep(stepId, `${events.length} events mapped (${newCount} new)`);
      this.state.phase = 'complete';
      return true;
    }

    this.failPlanStep(stepId, 'Page events had no usable fields');
    return false;
  }

  /**
   * Fetch webcal:// links by converting to https:// and parsing as ICS.
   */
  private async runWebcalLinkFlow(
    webcalLinks: Array<{ url: string; linkText: string }>,
    reconStepId: string
  ): Promise<boolean> {
    this.completePlanStep(reconStepId, `Found ${webcalLinks.length} calendar subscription(s)`);

    const stepId = '_webcal_fetch';
    this.addPlanStep(stepId, 'Downloading calendar subscription');
    this.activatePlanStep(stepId);
    this.reportProgress('Downloading calendar subscription...');

    let totalEvents = 0;
    let successCount = 0;

    for (const link of webcalLinks) {
      try {
        const httpsUrl = link.url.replace(/^webcal:\/\//i, 'https://');
        this.logSubStep(`Fetching: ${link.linkText || httpsUrl}`);
        const response = await fetch(httpsUrl);
        if (!response.ok) {
          console.warn(`[CA:orchestrator] webcal fetch failed: HTTP ${response.status} for ${httpsUrl}`);
          this.logSubStep(`HTTP ${response.status} — skipping`);
          continue;
        }

        const icsText = await response.text();
        if (!icsText.includes('BEGIN:VEVENT')) {
          console.log(`[CA:orchestrator] webcal has no VEVENTs: ${httpsUrl}`);
          this.logSubStep('No events in this feed — skipping');
          continue;
        }

        const events = parseIcsContent(icsText);
        console.log(`[CA:orchestrator] Parsed ${events.length} events from webcal ${httpsUrl}`);

        if (events.length > 0) {
          const result: ExtractionResult = {
            events,
            dateRange: this.computeDateRange(events),
            confidence: 'high',
            notes: `webcal feed: ${events.length} events from ${link.linkText || httpsUrl}`,
          };
          const newCount = this.mergeExtractedEvents(result);
          totalEvents += events.length;
          successCount++;
          this.logSubStep(`${events.length} events parsed (${newCount} new)`);
        }
      } catch (e) {
        console.warn(`[CA:orchestrator] webcal fetch error for ${link.url}:`, e);
        this.logSubStep(`Error: ${(e as Error).message}`);
      }
    }

    if (totalEvents > 0) {
      this.completePlanStep(stepId, `${totalEvents} events from ${successCount} feed(s), ${this.state.extractedEvents.length} unique total`);
      this.state.phase = 'complete';
      return true;
    }

    this.failPlanStep(stepId, 'All webcal feeds returned 0 events');
    return false;
  }

  private async runNavigateDomFlow(
    config: PlatformOrchestratorConfig,
    params: PlatformParams,
    reconStepId: string
  ): Promise<boolean> {
    this.completePlanStep(reconStepId, `${config.name} calendar detected — using fast extraction`);

    const now = new Date();
    const sDate = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}01`;
    const endYear = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
    const eDate = `${endYear}0630`;

    const startMonth = now.toLocaleString('en-US', { month: 'short' });
    const endMonth = 'Jun';

    const listUrl = config.buildExtractionUrl(params, { sDate, eDate });
    console.log(`[CA:orchestrator] ${config.name} extraction URL: ${listUrl}`);

    const navStepId = '_platform_switch_list';
    this.addPlanStep(navStepId, `Reading ${config.name} calendar for ${startMonth}–${endMonth} ${endYear}`);
    this.activatePlanStep(navStepId);
    this.reportProgress(`Reading ${config.name} calendar for ${startMonth}–${endMonth} ${endYear}...`);

    try {
      await this.navigateTab(listUrl);
      await this.injectContentScript();
      this.completePlanStep(navStepId, 'List view loaded');
    } catch (e) {
      this.failPlanStep(navStepId, (e as Error).message);
      return false;
    }

    const extractAllId = '_platform_extract_all';
    this.addPlanStep(extractAllId, `Reading ${config.name} events`);
    this.activatePlanStep(extractAllId);
    this.reportProgress(`Reading ${config.name} events...`);

    const listEvents = await this.sendContentMessage<any[]>('CA_EXTRACT_STATIC');
    console.log(`[CA:orchestrator] ${config.name} static extraction: ${listEvents.length} events`);

    if (listEvents.length > 0) {
      const listResult: ExtractionResult = {
        events: listEvents,
        dateRange: this.computeDateRange(listEvents),
        confidence: 'high',
        notes: `Static extraction: ${listEvents.length} events from ${config.name} list view`,
      };
      const newCount = this.mergeExtractedEvents(listResult);
      this.completePlanStep(extractAllId, `Found ${listEvents.length} events (${newCount} new)`);
      this.state.phase = 'complete';
      console.log(`[CA:orchestrator] ${config.name} deterministic flow complete`);
      return true;
    }

    this.failPlanStep(extractAllId, 'Static extraction returned 0 events');
    console.log(`[CA:orchestrator] ${config.name} static extraction returned 0 events`);
    return false;
  }

  private computeDateRange(events: any[]): { earliest: string; latest: string } | null {
    const dates = events
      .map((e: any) => e.start?.dateTime || e.start?.date || '')
      .filter(Boolean)
      .sort();
    return dates.length > 0 ? { earliest: dates[0], latest: dates[dates.length - 1] } : null;
  }

  private formatDateRange(sDate: string, eDate: string): string {
    const s = `${sDate.slice(4, 6)}/${sDate.slice(0, 4)}`;
    const e = `${eDate.slice(4, 6)}/${eDate.slice(0, 4)}`;
    return `${s} — ${e}`;
  }

  // ============ Main Loop ============

  private async mainLoop(): Promise<void> {
    while (!this.shouldTerminate()) {
      if (this.aborted) {
        this.log('Session aborted by user');
        this.state.phase = 'complete';
        break;
      }

      console.log(`[CA:orchestrator] --- Main loop iteration ${this.state.iterationCount + 1}, phase=${this.state.phase}, events=${this.state.extractedEvents.length} ---`);

      const tab = await chrome.tabs.get(this.state.tabId);
      const currentUrl = tab.url || '';

      let cleanedDom: string | null = null;
      if (this.state.phase === 'extracting' || this.shouldRefreshDom()) {
        console.log('[CA:orchestrator] Refreshing DOM for planner context');
        cleanedDom = await this.sendContentMessage<string>('CA_GET_CLEANED_DOM');
        console.log(`[CA:orchestrator] DOM refreshed: ${cleanedDom?.length} chars`);
      }

      const lastAction = this.state.actionHistory[this.state.actionHistory.length - 1];
      const plannerInput = buildPlannerInput(
        this.state,
        lastAction?.result,
        currentUrl
      );
      console.log('[CA:orchestrator] Calling planner with input:', JSON.stringify({
        eventsCollected: plannerInput.eventsCollected,
        dateRangeCovered: plannerInput.dateRangeCovered,
        iterationCount: plannerInput.iterationCount,
        phase: plannerInput.phase,
        errorCount: plannerInput.errorCount,
        hasDom: !!cleanedDom,
      }));

      this.reportProgress('AI is deciding next action...');
      const decision = await callPlanner(plannerInput, cleanedDom, this.apiKey, this.provider);
      console.log('[CA:orchestrator] Planner decision:', JSON.stringify({
        actionType: decision.action?.type,
        reasoning: decision.reasoning,
        updatedPhase: decision.updatedPhase,
        planStepId: decision.planStepId,
        hasPlanUpdate: !!decision.planUpdate,
        planUpdate: decision.planUpdate,
      }, null, 2));

      if (decision.planUpdate) {
        console.log(`[CA:orchestrator] Applying plan update: ${decision.planUpdate.length} new steps`);
        this.applyPlanUpdate(decision.planUpdate);
        console.log('[CA:orchestrator] Updated plan:', this.state.planSteps.map(s => `${s.id}: "${s.label}" [${s.status}]`));
      }

      this.state.phase = decision.updatedPhase;
      await this.handleDecision(decision);

      if (this.state.phase === 'complete' || this.state.phase === 'error') {
        console.log(`[CA:orchestrator] Exiting main loop: phase=${this.state.phase}`);
        break;
      }
    }
  }

  // ============ Decision Handler ============

  private async handleDecision(decision: PlannerDecision): Promise<void> {
    const action = decision.action;
    console.log(`[CA:orchestrator] handleDecision: type=${action.type}, planStepId=${decision.planStepId || '(none)'}`);
    this.log(`Action: ${action.type} — ${decision.reasoning}`);

    const stepId = decision.planStepId || this.inferPlanStepId(action);
    console.log(`[CA:orchestrator] Resolved stepId=${stepId} (planner=${decision.planStepId}, inferred=${!decision.planStepId})`);
    if (stepId) {
      this.activatePlanStep(stepId);
    }

    try {
      switch (action.type) {
        case 'extract-current-page':
          await this.handleExtractCurrentPage(decision, stepId);
          break;

        case 'extract-from-content':
          await this.handleExtractFromContent(action.content, action.contentType, decision, stepId);
          break;

        case 'download-file':
          await this.handleDownloadFile(action.url, decision, stepId);
          break;

        case 'interact':
          await this.handleInteract(action.instruction, decision, stepId);
          break;

        case 'navigate-to-url':
          await this.handleNavigateToUrl(action.url, decision, stepId);
          break;

        case 'fetch-api':
          await this.handleFetchApi(action.endpoint, action.params, decision, stepId);
          break;

        case 'done':
          this.log(`Done: ${action.reason}`);
          this.state.phase = 'complete';
          if (stepId) this.completePlanStep(stepId, action.reason);
          this.recordAction(decision, { newEventsFound: 0, dateRangeAfter: this.state.dateRangeCovered, success: true, error: null });
          break;

        case 'error':
          this.log(`Error: ${action.reason}`);
          this.state.phase = 'error';
          this.state.errorLog.push(action.reason);
          if (stepId) this.failPlanStep(stepId, action.reason);
          this.recordAction(decision, { newEventsFound: 0, dateRangeAfter: this.state.dateRangeCovered, success: false, error: action.reason });
          break;
      }
    } catch (e) {
      const errMsg = (e as Error).message;
      this.log(`Action failed: ${errMsg}`);
      this.state.errorLog.push(errMsg);
      if (stepId) this.failPlanStep(stepId, errMsg);
      this.recordAction(decision, { newEventsFound: 0, dateRangeAfter: this.state.dateRangeCovered, success: false, error: errMsg });
    }

    this.reportProgress(`Completed: ${action.type}`);
  }

  // ============ Action Handlers ============

  private async handleExtractCurrentPage(decision: PlannerDecision, stepId: string | null): Promise<void> {
    this.logSubStep('Cleaning DOM...');
    this.reportProgress('Extracting events from current page...');
    const cleanedDom = await this.sendContentMessage<string>('CA_GET_CLEANED_DOM');
    const tab = await chrome.tabs.get(this.state.tabId);

    this.logSubStep('Calling extractor...');
    const result = await extractFromDom(cleanedDom, tab.url || '', this.apiKey, this.provider);
    const newCount = this.mergeExtractedEvents(result);

    const resultMsg = `Found ${result.events.length} events (${newCount} new), confidence: ${result.confidence}`;
    this.log(resultMsg);
    if (result.notes) this.logSubStep(result.notes);
    if (stepId) this.completePlanStep(stepId, resultMsg);

    this.recordAction(decision, {
      newEventsFound: newCount,
      dateRangeAfter: this.state.dateRangeCovered,
      success: true,
      error: null,
    });
  }

  private async handleExtractFromContent(
    content: string,
    contentType: 'ics' | 'json' | 'html',
    decision: PlannerDecision,
    stepId: string | null
  ): Promise<void> {
    this.logSubStep(`Parsing ${contentType} content...`);
    this.reportProgress(`Extracting events from ${contentType} content...`);
    const result = await extractFromContent(content, contentType, this.apiKey, this.provider);
    const newCount = this.mergeExtractedEvents(result);

    const resultMsg = `Found ${result.events.length} events (${newCount} new) from ${contentType}`;
    this.log(resultMsg);
    if (stepId) this.completePlanStep(stepId, resultMsg);

    this.recordAction(decision, {
      newEventsFound: newCount,
      dateRangeAfter: this.state.dateRangeCovered,
      success: true,
      error: null,
    });
  }

  private async handleDownloadFile(url: string, decision: PlannerDecision, stepId: string | null): Promise<void> {
    this.logSubStep(`Downloading: ${url}`);
    this.reportProgress(`Downloading file...`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status}`);
      }

      const contentTypeHeader = response.headers.get('content-type') || '';
      const text = await response.text();

      let contentType: 'ics' | 'json' | 'html';
      if (contentTypeHeader.includes('calendar') || url.endsWith('.ics')) {
        contentType = 'ics';
      } else if (contentTypeHeader.includes('json')) {
        contentType = 'json';
      } else {
        contentType = 'html';
      }

      this.logSubStep(`Parsing ${contentType} content...`);
      const result = await extractFromContent(text, contentType, this.apiKey, this.provider);
      const newCount = this.mergeExtractedEvents(result);

      const resultMsg = `Downloaded and found ${result.events.length} events (${newCount} new)`;
      this.log(resultMsg);
      if (stepId) this.completePlanStep(stepId, resultMsg);

      this.recordAction(decision, {
        newEventsFound: newCount,
        dateRangeAfter: this.state.dateRangeCovered,
        success: true,
        error: null,
      });
    } catch (e) {
      const errMsg = (e as Error).message;
      this.log(`Download failed: ${errMsg}`);
      this.state.errorLog.push(errMsg);
      if (stepId) this.failPlanStep(stepId, errMsg);
      this.recordAction(decision, {
        newEventsFound: 0,
        dateRangeAfter: this.state.dateRangeCovered,
        success: false,
        error: errMsg,
      });
    }
  }

  private async handleInteract(
    instruction: InteractionInstruction,
    decision: PlannerDecision,
    stepId: string | null
  ): Promise<void> {
    const normalized = this.normalizeInteractionInstruction(instruction);
    this.logSubStep(`Goal: ${normalized.goal}`);
    this.reportProgress(`Interacting: ${normalized.goal}...`);

    let result: InteractionResult;
    try {
      result = await executeAndAssess(
        this.state.tabId,
        normalized,
        this.apiKey,
        this.provider
      );
    } catch (e) {
      const errMsg = (e as Error).message;
      if (this.isNavigationError(errMsg)) {
        console.log('[CA:orchestrator] Interaction caused page navigation — recovering...');
        result = await this.recoverFromNavigatingInteraction(normalized);
      } else {
        throw e;
      }
    }

    const resultMsg = result.success ? result.observation : `Failed: ${result.error || result.observation}`;
    this.log(`Interaction ${result.success ? 'succeeded' : 'failed'}: ${result.observation}`);
    if (result.newUrl) {
      this.logSubStep(`URL changed to: ${result.newUrl}`);
    }
    if (stepId) {
      if (result.success) {
        this.completePlanStep(stepId, resultMsg);
      } else {
        this.failPlanStep(stepId, resultMsg);
      }
    }

    this.recordAction(decision, {
      newEventsFound: 0,
      dateRangeAfter: this.state.dateRangeCovered,
      success: result.success,
      error: result.error,
    });
  }

  private isNavigationError(msg: string): boolean {
    return msg.includes('back/forward cache')
      || msg.includes('message channel is closed')
      || msg.includes('Receiving end does not exist')
      || msg.includes('message port closed');
  }

  /**
   * When an interaction click causes a full page navigation, the content script
   * is destroyed. Wait for the page to finish loading, re-inject, and report success.
   */
  private async recoverFromNavigatingInteraction(
    instruction: InteractionInstruction
  ): Promise<InteractionResult> {
    this.logSubStep('Click caused page navigation, waiting for page to load...');

    await this.waitForTabLoad();
    this.logSubStep('Re-injecting content script...');
    await this.injectContentScript();

    const tab = await chrome.tabs.get(this.state.tabId);
    const newUrl = tab.url || '';
    console.log(`[CA:orchestrator] Recovered after navigation — new URL: ${newUrl}`);

    this.logSubStep('Re-scanning page...');
    const scanResult = await this.sendContentMessage<StructuredScanResult>('CA_RUN_DETERMINISTIC_SCAN');
    this.state.reconnaissance.structured = scanResult;

    return {
      success: true,
      stepsCompleted: instruction.steps.length,
      stepsAttempted: instruction.steps.length,
      observation: `Interaction triggered page navigation to ${newUrl}. Page reloaded and content script re-injected.`,
      newUrl,
      domChanged: true,
      error: null,
    };
  }

  private async waitForTabLoad(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.webNavigation.onCompleted.removeListener(listener);
        resolve();
      }, 15_000);

      const listener = (details: chrome.webNavigation.WebNavigationFramedCallbackDetails) => {
        if (details.tabId === this.state.tabId && details.frameId === 0) {
          clearTimeout(timeout);
          chrome.webNavigation.onCompleted.removeListener(listener);
          setTimeout(resolve, 1500);
        }
      };

      chrome.webNavigation.onCompleted.addListener(listener);

      chrome.tabs.get(this.state.tabId).then(tab => {
        if (tab.status === 'complete') {
          clearTimeout(timeout);
          chrome.webNavigation.onCompleted.removeListener(listener);
          setTimeout(resolve, 1500);
        }
      }).catch(reject);
    });
  }

  private async handleNavigateToUrl(url: string, decision: PlannerDecision, stepId: string | null): Promise<void> {
    this.logSubStep(`Navigating to: ${url}`);
    this.reportProgress(`Navigating to new page...`);

    try {
      await this.navigateTab(url);
      this.logSubStep('Re-injecting content script...');
      await this.injectContentScript();

      this.logSubStep('Re-scanning page...');
      const scanResult = await this.sendContentMessage<StructuredScanResult>('CA_RUN_DETERMINISTIC_SCAN');
      this.state.reconnaissance.structured = scanResult;

      if (stepId) this.completePlanStep(stepId, 'Navigation complete');
      this.recordAction(decision, {
        newEventsFound: 0,
        dateRangeAfter: this.state.dateRangeCovered,
        success: true,
        error: null,
      });
    } catch (e) {
      const errMsg = (e as Error).message;
      this.log(`Navigation failed: ${errMsg}`);
      this.state.errorLog.push(errMsg);
      if (stepId) this.failPlanStep(stepId, errMsg);
      this.recordAction(decision, {
        newEventsFound: 0,
        dateRangeAfter: this.state.dateRangeCovered,
        success: false,
        error: errMsg,
      });
    }
  }

  private async handleFetchApi(
    endpoint: { url: string; method: string; parameters: any[]; responseFormat: string },
    params: Record<string, string>,
    decision: PlannerDecision,
    stepId: string | null
  ): Promise<void> {
    this.logSubStep(`Fetching: ${endpoint.url}`);
    this.reportProgress(`Fetching API...`);

    try {
      let url = endpoint.url;
      const options: RequestInit = { method: endpoint.method };

      if (endpoint.method === 'GET') {
        const qp = new URLSearchParams(params);
        url = `${url}?${qp.toString()}`;
      } else {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(params);
      }

      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`API fetch failed: HTTP ${response.status}`);

      const text = await response.text();
      const contentType = endpoint.responseFormat === 'ics' ? 'ics'
        : endpoint.responseFormat === 'json' ? 'json' : 'html';

      this.logSubStep(`Parsing ${contentType} response...`);
      const result = await extractFromContent(text, contentType as any, this.apiKey, this.provider);
      const newCount = this.mergeExtractedEvents(result);

      const resultMsg = `API returned ${result.events.length} events (${newCount} new)`;
      this.log(resultMsg);
      if (stepId) this.completePlanStep(stepId, resultMsg);

      this.recordAction(decision, {
        newEventsFound: newCount,
        dateRangeAfter: this.state.dateRangeCovered,
        success: true,
        error: null,
      });
    } catch (e) {
      const errMsg = (e as Error).message;
      this.log(`API fetch failed: ${errMsg}`);
      this.state.errorLog.push(errMsg);
      if (stepId) this.failPlanStep(stepId, errMsg);
      this.recordAction(decision, {
        newEventsFound: 0,
        dateRangeAfter: this.state.dateRangeCovered,
        success: false,
        error: errMsg,
      });
    }
  }

  // ============ Plan Step Management ============

  private addPlanStep(id: string, label: string): void {
    const exists = this.state.planSteps.some(s => s.id === id);
    if (!exists) {
      this.state.planSteps.push({ id, label, status: 'pending', subSteps: [] });
      console.log(`[CA:plan] + Step added: "${id}" → "${label}"`);
    }
  }

  private activatePlanStep(id: string): void {
    let step = this.state.planSteps.find(s => s.id === id);
    if (!step) {
      console.log(`[CA:plan] Step "${id}" not found, creating ad-hoc`);
      this.addPlanStep(id, id);
      step = this.state.planSteps[this.state.planSteps.length - 1];
    }
    if (step.status === 'pending') {
      step.status = 'active';
      console.log(`[CA:plan] ▶ Step activated: "${id}" → "${step.label}"`);
    }
    this.activePlanStepId = id;
    this.reportProgress(`Executing: ${step.label}`);
  }

  private completePlanStep(id: string, result: string): void {
    const step = this.state.planSteps.find(s => s.id === id);
    if (step && (step.status === 'active' || step.status === 'pending')) {
      step.status = 'completed';
      step.result = result;
      console.log(`[CA:plan] ✓ Step completed: "${id}" → ${result}`);
    }
    if (this.activePlanStepId === id) {
      this.activePlanStepId = null;
    }
  }

  private failPlanStep(id: string, error: string): void {
    const step = this.state.planSteps.find(s => s.id === id);
    if (step && (step.status === 'active' || step.status === 'pending')) {
      step.status = 'failed';
      step.result = error;
      console.log(`[CA:plan] ✗ Step failed: "${id}" → ${error}`);
    }
    if (this.activePlanStepId === id) {
      this.activePlanStepId = null;
    }
  }

  private logSubStep(message: string): void {
    this.log(message);
    if (this.activePlanStepId) {
      const step = this.state.planSteps.find(s => s.id === this.activePlanStepId);
      if (step) {
        step.subSteps.push({
          message,
          timestamp: new Date().toISOString().substring(11, 19),
        });
        this.reportProgress(message);
      }
    }
  }

  private applyPlanUpdate(newSteps: Array<{ id: string; label: string }>): void {
    const removedCount = this.state.planSteps.filter(s => s.status === 'pending').length;
    const kept = this.state.planSteps.filter(s => s.status !== 'pending');
    for (const ns of newSteps) {
      if (!kept.some(s => s.id === ns.id)) {
        kept.push({ id: ns.id, label: ns.label, status: 'pending', subSteps: [] });
      }
    }
    this.state.planSteps = kept;
    console.log(`[CA:plan] Plan updated: removed ${removedCount} pending, added ${newSteps.length} new → ${this.state.planSteps.length} total`);
  }

  /**
   * If the planner didn't specify a planStepId, try to find a matching
   * pending step by action type, or create an ad-hoc one.
   */
  private inferPlanStepId(action: PlannerAction): string | null {
    if (action.type === 'done' || action.type === 'error') return null;

    const pending = this.state.planSteps.filter(s => s.status === 'pending');
    if (pending.length === 0) {
      const adHocId = `_action_${this.state.iterationCount}`;
      this.addPlanStep(adHocId, this.actionLabel(action));
      return adHocId;
    }

    const isNavAction = action.type === 'interact' || action.type === 'navigate-to-url';
    const isExtractAction = action.type === 'extract-current-page' || action.type === 'extract-from-content';

    for (const step of pending) {
      const lbl = step.id.toLowerCase() + ' ' + step.label.toLowerCase();
      if (isNavAction && (lbl.includes('nav') || lbl.includes('navigate'))) return step.id;
      if (isExtractAction && (lbl.includes('extract') || lbl.includes('parse'))) return step.id;
      if (action.type === 'download-file' && (lbl.includes('download') || lbl.includes('file'))) return step.id;
    }

    return pending[0].id;
  }

  /**
   * Normalize interaction instruction — convert string steps to structured InteractionStep objects.
   * The LLM sometimes returns steps as plain strings instead of structured objects.
   */
  private normalizeInteractionInstruction(instruction: InteractionInstruction): InteractionInstruction {
    const normalizedSteps: InteractionStep[] = instruction.steps.map((step, i) => {
      if (typeof step === 'object' && step !== null && typeof step.action === 'string') {
        return step;
      }

      const raw = typeof step === 'string' ? step : JSON.stringify(step);
      console.log(`[CA:orchestrator] Normalizing string step ${i + 1}: "${raw}"`);

      const clickMatch = raw.match(/[Cc]lick.*?(?:selector\s*['"]?|with selector\s*['"]?|['"])([.#\w\-[\]=>"~ :]+)['"]?/);
      if (clickMatch) {
        return { action: 'click' as const, selector: clickMatch[1].trim(), description: raw };
      }

      const typeMatch = raw.match(/[Ss]et.*?(?:value|input).*?(?:selector\s*['"]?|with selector\s*['"]?|['"])([.#\w\-[\]=>"~ :]+)['"]?\s*(?:to|=)\s*['"]?([^'".\]]+)/);
      if (typeMatch) {
        return { action: 'type' as const, selector: typeMatch[1].trim(), value: typeMatch[2].trim(), description: raw };
      }

      const selectorSetMatch = raw.match(/[Ss]et.*?['"]([.#\w\-[\]=>"~ :]+)['"].*?['"]([^'"]+)['"]/);
      if (selectorSetMatch) {
        return { action: 'type' as const, selector: selectorSetMatch[1].trim(), value: selectorSetMatch[2].trim(), description: raw };
      }

      if (/scroll\s*down/i.test(raw)) {
        return { action: 'scroll-down' as const, description: raw };
      }

      const waitMatch = raw.match(/wait\s*(\d+)\s*(?:ms|millisecond)/i);
      if (waitMatch) {
        return { action: 'wait' as const, waitMs: parseInt(waitMatch[1]), description: raw };
      }

      console.warn(`[CA:orchestrator] Could not parse step, defaulting to click with best-guess selector`);
      const anySelectorMatch = raw.match(/['"]([.#][^'"]+)['"]/);
      if (anySelectorMatch) {
        return { action: 'click' as const, selector: anySelectorMatch[1].trim(), description: raw };
      }

      return { action: 'wait' as const, waitMs: 100, description: `Unparseable step: ${raw}` };
    });

    console.log('[CA:orchestrator] Normalized steps:', normalizedSteps.map(s => `${s.action} ${s.selector || ''} ${s.value || ''}`));
    return { goal: instruction.goal, steps: normalizedSteps };
  }

  private actionLabel(action: PlannerAction): string {
    switch (action.type) {
      case 'extract-current-page': return 'Extract events from page';
      case 'extract-from-content': return `Extract events from ${action.contentType}`;
      case 'download-file': return `Download file`;
      case 'interact': return action.instruction.goal;
      case 'navigate-to-url': return `Navigate to new page`;
      case 'fetch-api': return `Fetch API data`;
      default: return action.type;
    }
  }

  // ============ Event Deduplication & Merging ============

  private mergeExtractedEvents(result: ExtractionResult): number {
    let newCount = 0;
    let dupeCount = 0;

    for (const event of result.events) {
      const hash = computeEventHash(event);

      if (!this.state.eventHashes.has(hash)) {
        this.state.extractedEvents.push(event);
        this.state.eventHashes.add(hash);
        newCount++;
        console.log(`[CA:orchestrator] + New event: "${event.summary}" (${event.start?.dateTime || event.start?.date || '?'})`);
      } else {
        dupeCount++;
      }
    }

    if (dupeCount > 0) {
      console.log(`[CA:orchestrator] Skipped ${dupeCount} duplicate event(s)`);
    }
    console.log(`[CA:orchestrator] Merge complete: ${newCount} new, ${dupeCount} dupes, ${this.state.extractedEvents.length} total`);
    this.updateDateRange();
    return newCount;
  }

  private updateDateRange(): void {
    if (this.state.extractedEvents.length === 0) {
      this.state.dateRangeCovered = null;
      return;
    }

    const dates = this.state.extractedEvents
      .map((e) => e.start?.dateTime || e.start?.date || '')
      .filter(Boolean)
      .sort();

    if (dates.length === 0) {
      this.state.dateRangeCovered = null;
      return;
    }

    this.state.dateRangeCovered = {
      earliest: dates[0],
      latest: dates[dates.length - 1],
    };
  }

  // ============ Tab Navigation ============

  private async navigateTab(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.webNavigation.onCompleted.removeListener(listener);
        reject(new Error('Navigation timed out after 30 seconds'));
      }, 30_000);

      const listener = (details: chrome.webNavigation.WebNavigationFramedCallbackDetails) => {
        if (details.tabId === this.state.tabId && details.frameId === 0) {
          clearTimeout(timeout);
          chrome.webNavigation.onCompleted.removeListener(listener);
          setTimeout(resolve, 1000);
        }
      };

      chrome.webNavigation.onCompleted.addListener(listener);
      chrome.tabs.update(this.state.tabId, { url });
    });
  }

  private async injectContentScript(): Promise<void> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: this.state.tabId },
        files: ['calendarAgentContent.js'],
      });
      console.log('[CA:orchestrator] Content script injected successfully');
    } catch (e) {
      throw new Error(`Failed to inject content script: ${(e as Error).message}`);
    }
  }

  // ============ Content Script Communication ============

  private async sendContentMessage<T>(type: string, payload?: Record<string, unknown>): Promise<T> {
    const message = { type, ...payload };
    let response: any;
    try {
      response = await chrome.tabs.sendMessage(this.state.tabId, message);
    } catch (e) {
      const errMsg = (e as Error).message;
      if (this.isNavigationError(errMsg)) {
        console.log(`[CA:orchestrator] Content script lost (${type}), re-injecting...`);
        await this.waitForTabLoad();
        await this.injectContentScript();
        response = await chrome.tabs.sendMessage(this.state.tabId, message);
      } else {
        throw e;
      }
    }

    if (response?.type === 'error') {
      throw new Error(`Content script error: ${response.error}`);
    }

    switch (response?.type) {
      case 'dom':
        return response.html as T;
      case 'scan-result':
        return response.result as T;
      case 'snapshot':
        return response.snapshot as T;
      case 'static-events':
        return response.events as T;
      case 'interaction-executed':
        return response as T;
      default:
        return response as T;
    }
  }

  // ============ Termination Conditions ============

  private shouldTerminate(): boolean {
    if (this.state.iterationCount >= this.state.maxIterations) {
      this.log(`Hard termination: max iterations (${this.state.maxIterations}) reached`);
      this.state.phase = 'complete';
      return true;
    }

    if (Date.now() - this.state.startTime > this.state.sessionTimeoutMs) {
      this.log(`Hard termination: session timeout (${this.state.sessionTimeoutMs / 1000}s) exceeded`);
      this.state.phase = 'complete';
      return true;
    }

    if (this.state.errorLog.length >= MAX_ERRORS) {
      this.log(`Hard termination: too many errors (${this.state.errorLog.length})`);
      this.state.phase = 'error';
      return true;
    }

    const history = this.state.actionHistory;
    if (history.length >= 2) {
      const last = history[history.length - 1];
      const prev = history[history.length - 2];
      if (
        JSON.stringify(last.action) === JSON.stringify(prev.action) &&
        JSON.stringify(last.result) === JSON.stringify(prev.result)
      ) {
        this.log('Hard termination: infinite loop detected (same action and result twice)');
        this.state.phase = 'complete';
        return true;
      }
    }

    return false;
  }

  private shouldRefreshDom(): boolean {
    const lastAction = this.state.actionHistory[this.state.actionHistory.length - 1];
    if (!lastAction) return false;
    return lastAction.action.type === 'interact' || lastAction.action.type === 'navigate-to-url';
  }

  // ============ State Bookkeeping ============

  private recordAction(
    decision: PlannerDecision,
    result: ActionRecord['result']
  ): void {
    this.state.iterationCount++;
    this.state.actionHistory.push({
      iteration: this.state.iterationCount,
      action: decision.action,
      reasoning: decision.reasoning,
      result,
    });
  }

  // ============ Logging & Progress ============

  private log(message: string): void {
    const timestamp = new Date().toISOString().substring(11, 19);
    const entry = `[${timestamp}] ${message}`;
    this.activityLog.push(entry);
    console.log(`[CalendarAgent] ${message}`);
  }

  private reportProgress(currentAction: string): void {
    this.onProgress({
      phase: this.state.phase,
      iterationCount: this.state.iterationCount,
      maxIterations: this.state.maxIterations,
      eventsFound: this.state.extractedEvents.length,
      dateRangeCovered: this.state.dateRangeCovered,
      currentAction,
      activityLog: [...this.activityLog],
      planSteps: this.state.planSteps.map(s => ({
        ...s,
        subSteps: [...s.subSteps],
      })),
      unknownPlatformNotice: this.unknownPlatformNotice || undefined,
      pageUrl: this.unknownPlatformNotice ? this.pageUrl : undefined,
    });
  }

  // ============ Finalization ============

  private finalize(): ExtractedEvent[] {
    console.log('[CA:orchestrator] === FINALIZATION ===');

    for (const step of this.state.planSteps) {
      if (step.status === 'pending') {
        step.status = 'skipped';
        console.log(`[CA:plan] — Step skipped: "${step.id}"`);
      } else if (step.status === 'active') {
        step.status = 'completed';
        if (!step.result) step.result = 'Session ended';
        console.log(`[CA:plan] — Step auto-completed: "${step.id}"`);
      }
    }

    const seen = new Set<string>();
    const deduped: ExtractedEvent[] = [];
    for (const event of this.state.extractedEvents) {
      const hash = computeEventHash(event);
      if (!seen.has(hash)) {
        seen.add(hash);
        deduped.push(event);
      }
    }

    deduped.sort((a, b) => {
      const aDate = a.start?.dateTime || a.start?.date || '';
      const bDate = b.start?.dateTime || b.start?.date || '';
      return aDate.localeCompare(bDate);
    });

    console.log(`[CA:orchestrator] === SESSION COMPLETE ===`);
    console.log(`[CA:orchestrator] Total events: ${deduped.length}`);
    console.log(`[CA:orchestrator] Date range: ${this.state.dateRangeCovered?.earliest || 'N/A'} to ${this.state.dateRangeCovered?.latest || 'N/A'}`);
    console.log(`[CA:orchestrator] Iterations: ${this.state.iterationCount}`);
    console.log(`[CA:orchestrator] Errors: ${this.state.errorLog.length}`);
    console.log('[CA:orchestrator] Final plan:', this.state.planSteps.map(s => `  ${s.status === 'completed' ? '✓' : s.status === 'failed' ? '✗' : '—'} ${s.id}: ${s.label} → ${s.result || '(no result)'}`).join('\n'));
    if (deduped.length > 0) {
      console.log('[CA:orchestrator] Extracted events:');
      deduped.forEach((e, i) => console.log(`  ${i + 1}. "${e.summary}" — ${e.start?.dateTime || e.start?.date || '?'} ${e.location ? `@ ${e.location}` : ''}`));
    }

    this.log(`Session complete. ${deduped.length} events extracted.`);
    if (this.state.dateRangeCovered) {
      this.log(`Date range: ${this.state.dateRangeCovered.earliest} to ${this.state.dateRangeCovered.latest}`);
    }
    if (this.state.errorLog.length > 0) {
      this.log(`Errors encountered: ${this.state.errorLog.length}`);
    }

    this.reportProgress('Session complete');
    return deduped;
  }
}
