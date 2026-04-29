/**
 * Planner Agent — the central decision-maker for a calendar extraction session.
 * Receives session state, returns exactly one PlannerDecision per call.
 * On the first call also performs page reconnaissance.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCalendarToken } from '../lib/calendarAuth';
import type {
  PlannerInput,
  PlannerDecision,
  PlannerReconnaissanceResponse,
  StructuredScanResult,
  ReconnaissanceResult,
} from './types';

const AMBIENT_API_BASE = 'https://tryambientai.com/extension_endpoint';

const PLANNER_SYSTEM_PROMPT = `You are the Planner agent for a calendar event extraction system. Your job is to decide the next action in an extraction session.

You will receive the current session state as JSON. You must respond with a single JSON object matching the PlannerDecision schema:
{
  "action": { "type": "<action-type>", ...action-specific-fields },
  "reasoning": "<1-3 sentence explanation>",
  "updatedPhase": "<reconnaissance|extracting|navigating|complete|error>",
  "planStepId": "<id of the plan step this action belongs to, if applicable>",
  "planUpdate": [{"id": "...", "label": "..."}]  // optional — only include if the remaining plan has changed
}

IMPORTANT: The "planStepId" field MUST be included with every decision. It must match one of the step IDs from the current plan. Look at the "planSteps" array in the input to see which steps are pending, completed, or failed. Pick the step your action corresponds to. If retrying a failed step, you may reuse that step's ID. Only omit planStepId if your action truly doesn't map to any existing step.

The "planUpdate" field is optional. Include it ONLY when the remaining plan needs to change (e.g., you discover more pages to extract, or a strategy failed and you're switching approaches). It replaces all pending (not yet started) steps. Do not include already-completed or in-progress steps.

Possible action types:
- "extract-current-page": Extract events from the current page DOM
- "extract-from-content": Extract from provided content (with "content" and "contentType" fields)
- "download-file": Download a file (with "url" field)
- "interact": Interact with the page. The "instruction" field must contain:
  - "goal": string description of what the interaction should achieve
  - "steps": array of STRUCTURED step objects. Each step MUST be a JSON object (NOT a string) with:
    - "action": one of "click", "type", "scroll-down", "wait"
    - "selector": CSS selector for the target element (required for "click" and "type")
    - "value": text to type (required for "type" action)
    - "waitMs": milliseconds to wait (for "wait" action, default 1000)
    - "description": human-readable description of what this step does
  Example interact action:
  {"type": "interact", "instruction": {"goal": "Navigate to next month", "steps": [{"action": "click", "selector": "a.next-button", "description": "Click the Next button"}]}}
- "navigate-to-url": Navigate to a URL (with "url" field)
- "fetch-api": Fetch an API endpoint (with "endpoint" and "params" fields)
- "done": Extraction complete (with "reason" field)
- "error": Unrecoverable error (with "reason" field)

Decision priorities:
1. Check if extraction should stop (max iterations, no new events after 2+ future months, errors, loops)
2. If first call: assess the page and pick a strategy
3. If events were just extracted: evaluate coverage and decide if more are needed
4. If navigation is needed: prefer URL/API manipulation over DOM interaction
5. If interaction just completed: analyze what changed and decide next step

CRITICAL strategy rules:
- LIST VIEW FIRST: If the page has a list/agenda view toggle (vs grid/month view), ALWAYS switch to list view before extracting. List views render all events in a date range linearly, while grid/month views often hide events that don't fit in the grid cells. Look for controls like "List View", "Agenda", or "switch-to-list" buttons/links.
- BULK OVER PAGINATION: Always prefer methods that fetch many events at once. URL parameter manipulation with a wide date range is far better than clicking "Next" month by month. If the URL supports date range params, set a wide range and extract in one pass. Only fall back to next/prev button pagination if URL/API manipulation is unavailable or has failed.
- When using URL date range params, set the end date to the NEXT June 30 (i.e. June 30 of the current year if before July, otherwise June 30 of next year). School calendars rarely have events over summer. For non-school calendars, also use the next June 30 as a safe upper bound. The start date should be the beginning of the current month.

Only emit ONE action per call. Never batch actions.
Never instruct backward-in-time navigation — only go forward.
If unsure between continuing and stopping, prefer extracting one more page.

Always respond with valid JSON only. No commentary outside the JSON.`;

const RECONNAISSANCE_ADDENDUM = `
This is the first call. You are also performing page reconnaissance. You will receive the cleaned DOM and deterministic scan results.

Return a JSON object with these fields:
- "reconnaissance": a PageAssessment object with: currentDateRange, visibleEventCount, calendarType, controls (array of {selector, elementDescription, inferredFunction, confidence}), recommendedStrategy, strategyReasoning
- "decision": your first PlannerDecision (include planStepId matching the first step of your plan)
- "discoveredUrlPattern": (optional) if the current URL contains manipulable date parameters, include a UrlPattern object with template, parameters, and example
- "planOutline": an array of high-level steps you plan to take, each with "id" and "label" fields. These are displayed to the user as a progress checklist.

Assess the DOM for:
- What date range is currently visible
- How many events are visible
- What interactive controls exist (next/prev buttons, date pickers, view toggles, LIST/AGENDA view toggles)
- Whether the URL contains date parameters that can be manipulated directly
- Whether the page is in grid/month view vs list/agenda view
- The best extraction strategy

IMPORTANT — View mode: If the calendar is in a grid or month view AND a list/agenda view toggle exists, your FIRST action should be to switch to list view. Grid views only render events that fit in calendar cells and often truncate or hide events. List views render all events in a date range, making extraction much more complete.

Strategy priority (highest to lowest):
1. Structured download (ICS/webcal links) — always best if available
2. Schema.org / JSON-LD events in page
3. API endpoint
4. Switch to list view + URL date range manipulation — set a date range from today through the next June 30 to get all remaining events in one load
5. URL date range manipulation (even in grid view) — still better than pagination
6. Page interaction (next/prev buttons) — last resort, only if URL manipulation is unavailable
7. Static extraction only — no controls, no downloads

For planOutline, create a concrete sequence of steps based on your chosen strategy. Examples:
- ICS download strategy: [{"id": "download_ics", "label": "Download calendar file"}, {"id": "parse_events", "label": "Parse events from file"}]
- List view + wide date range: [{"id": "switch_list", "label": "Switch to list view"}, {"id": "set_date_range", "label": "Set date range through end of school year"}, {"id": "extract_all", "label": "Extract all events"}]
- URL date range: [{"id": "nav_wide_range", "label": "Navigate to wide date range"}, {"id": "extract_all", "label": "Extract all events"}]
- Pagination (last resort): [{"id": "extract_current", "label": "Extract events from current view"}, {"id": "nav_next_1", "label": "Navigate to next month"}, {"id": "extract_next_1", "label": "Extract next month's events"}, ...]
- Static extraction: [{"id": "extract_page", "label": "Extract all events from page"}]

Use descriptive labels that tell the user what will happen. Include specific details when known (month names, URLs, etc). Plan 2-6 steps typically.`;

/**
 * Call the Planner for reconnaissance + first decision.
 */
export async function callPlannerReconnaissance(
  cleanedDom: string,
  scanResults: StructuredScanResult,
  currentUrl: string,
  apiKey: string | undefined,
  provider: 'gemini_key' | 'ambient_ai'
): Promise<PlannerReconnaissanceResponse> {
  console.log(`[CA:planner] callPlannerReconnaissance — url=${currentUrl}, domSize=${cleanedDom.length}, provider=${provider}`);
  const userMessage = JSON.stringify({
    currentUrl,
    deterministicScanResults: scanResults,
    cleanedDom,
  });
  console.log(`[CA:planner] Reconnaissance user message size: ${userMessage.length} chars`);

  const systemPrompt = PLANNER_SYSTEM_PROMPT + RECONNAISSANCE_ADDENDUM;
  console.log(`[CA:planner] System prompt size: ${systemPrompt.length} chars`);
  console.log('[CA:planner] Calling LLM for reconnaissance...');
  const startTime = Date.now();
  const responseText = await callLlm(systemPrompt, userMessage, apiKey, provider);
  console.log(`[CA:planner] LLM response received in ${Date.now() - startTime}ms, size=${responseText.length} chars`);
  console.log('[CA:planner] Raw reconnaissance response:', responseText.substring(0, 2000) + (responseText.length > 2000 ? '...(truncated)' : ''));

  const parsed = parseJsonResponse<PlannerReconnaissanceResponse>(responseText);
  console.log('[CA:planner] Parsed reconnaissance response OK');
  return parsed;
}

/**
 * Call the Planner for a subsequent decision.
 */
export async function callPlanner(
  input: PlannerInput,
  cleanedDom: string | null,
  apiKey: string | undefined,
  provider: 'gemini_key' | 'ambient_ai'
): Promise<PlannerDecision> {
  console.log(`[CA:planner] callPlanner — iteration=${input.iterationCount}, events=${input.eventsCollected}, phase=${input.phase}, hasDom=${!!cleanedDom}`);
  const payload: Record<string, unknown> = { ...input };
  if (cleanedDom) {
    payload.currentDom = cleanedDom;
  }

  const userMessage = JSON.stringify(payload);
  console.log(`[CA:planner] Planner user message size: ${userMessage.length} chars`);
  console.log('[CA:planner] Calling LLM for decision...');
  const startTime = Date.now();
  const responseText = await callLlm(PLANNER_SYSTEM_PROMPT, userMessage, apiKey, provider);
  console.log(`[CA:planner] LLM response received in ${Date.now() - startTime}ms, size=${responseText.length} chars`);
  console.log('[CA:planner] Raw planner response:', responseText.substring(0, 1500) + (responseText.length > 1500 ? '...(truncated)' : ''));

  const parsed = parseJsonResponse<PlannerDecision>(responseText);
  console.log(`[CA:planner] Parsed decision: action=${parsed.action?.type}, phase=${parsed.updatedPhase}, stepId=${parsed.planStepId || '(none)'}`);
  return parsed;
}

// ============ LLM Call Routing ============

async function callLlm(
  systemPrompt: string,
  userMessage: string,
  apiKey: string | undefined,
  provider: 'gemini_key' | 'ambient_ai'
): Promise<string> {
  if (provider === 'ambient_ai') {
    return callAmbientApi('planner', systemPrompt, userMessage);
  }

  if (!apiKey) throw new Error('No API key provided for Gemini');
  return callGeminiDirect(systemPrompt, userMessage, apiKey);
}

async function callGeminiDirect(
  systemPrompt: string,
  userMessage: string,
  apiKey: string
): Promise<string> {
  console.log('[CA:planner] Using Gemini direct API');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
    generationConfig: { responseMimeType: 'application/json' },
  });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
  });

  return result.response.text();
}

async function callAmbientApi(
  role: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  console.log(`[CA:planner] Using Ambient API — role=${role}`);
  const googleToken = await getCalendarToken();
  console.log(`[CA:planner] Got Google token (length=${googleToken?.length || 0})`);

  const body = JSON.stringify({ role, system_prompt: systemPrompt, user_message: userMessage });
  console.log(`[CA:planner] POST ${AMBIENT_API_BASE}/calendar_agent/ — body size=${body.length}`);

  const response = await fetch(`${AMBIENT_API_BASE}/calendar_agent/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${googleToken}`,
    },
    body,
  });

  console.log(`[CA:planner] Ambient API response: status=${response.status}`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[CA:planner] Ambient API error: ${errorText}`);
    throw new Error(`Calendar agent API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.success) {
    console.error(`[CA:planner] Ambient API returned success=false:`, data.error);
    throw new Error(data.error || 'Unknown calendar agent API error');
  }
  console.log(`[CA:planner] Ambient API response size: ${data.response?.length || 0} chars`);
  return data.response;
}

// ============ Response Parsing ============

function parseJsonResponse<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    console.error('[CA:planner] JSON parse failed. Cleaned text:', cleaned.substring(0, 500));
    throw e;
  }
}

/**
 * Build condensed planner input from session state.
 */
export function buildPlannerInput(
  state: {
    extractedEvents: { length: number };
    dateRangeCovered: PlannerInput['dateRangeCovered'];
    reconnaissance: ReconnaissanceResult;
    discoveredUrlPattern: PlannerInput['discoveredUrlPattern'];
    discoveredApiEndpoint: PlannerInput['discoveredApiEndpoint'];
    actionHistory: PlannerInput['recentActions'];
    planSteps: Array<{ id: string; label: string; status: string; result?: string }>;
    iterationCount: number;
    maxIterations: number;
    errorLog: string[];
    phase: PlannerInput['phase'];
  },
  lastActionResult: unknown,
  currentUrl: string
): PlannerInput {
  return {
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
    lastActionResult,
    currentUrl,
    planSteps: state.planSteps.map(s => ({ id: s.id, label: s.label, status: s.status as any, result: s.result })),
  };
}
