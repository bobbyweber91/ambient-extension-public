/**
 * Interactor Agent — coordinates browser automation with LLM observation assessment.
 * The content script executes deterministic actions (click, type, scroll, wait).
 * The LLM interprets the before/after DOM diff and generates a meaningful observation.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getCalendarToken } from '../lib/calendarAuth';
import type {
  InteractionInstruction,
  InteractionResult,
  DomSnapshot,
} from './types';

const AMBIENT_API_BASE = 'https://tryambientai.com/extension_endpoint';

const INTERACTOR_SYSTEM_PROMPT = `You are the Interactor agent for a calendar event extraction system. You assess browser interactions and report what happened.

You will receive:
1. An interaction instruction with a goal and steps
2. Before/after DOM snapshots showing what changed

Your job is to generate an InteractionResult JSON object:
{
  "success": <boolean - did the interaction achieve its stated goal?>,
  "stepsCompleted": <number>,
  "stepsAttempted": <number>,
  "observation": "<specific description of what changed on the page>",
  "newUrl": "<new URL if it changed, or null>",
  "domChanged": <boolean - did the DOM content visibly change?>,
  "error": "<error message if something failed, or null>"
}

Observation guidelines:
- Be SPECIFIC: "Calendar header changed from 'March 2026' to 'April 2026'" not "the page changed"
- Focus on calendar-relevant changes: date ranges, event content, navigation controls
- Note if the forward navigation control is still present (important for detecting end of calendar)
- Note any error messages, modals, or login prompts that appeared
- Be honest about uncertainty

Always respond with valid JSON only.`;

/**
 * Execute an interaction and assess the result.
 * 1. Sends steps to content script for execution
 * 2. Receives before/after snapshots
 * 3. Calls LLM to interpret the diff and assess success
 */
export async function executeAndAssess(
  tabId: number,
  instruction: InteractionInstruction,
  apiKey: string | undefined,
  provider: 'gemini_key' | 'ambient_ai'
): Promise<InteractionResult> {
  console.log(`[CA:interactor] executeAndAssess — goal="${instruction.goal}", steps=${instruction.steps.length}`);
  instruction.steps.forEach((s, i) => console.log(`[CA:interactor]   Step ${i + 1}: ${s.action} ${s.selector || ''} ${s.value || ''} ${s.waitMs ? `(wait ${s.waitMs}ms)` : ''} — ${s.description}`));

  console.log('[CA:interactor] Sending steps to content script...');
  const contentResponse = await chrome.tabs.sendMessage(tabId, {
    type: 'CA_EXECUTE_INTERACTION',
    steps: instruction.steps,
  });

  if (contentResponse.type === 'error') {
    console.error(`[CA:interactor] Content script error: ${contentResponse.error}`);
    return {
      success: false,
      stepsCompleted: 0,
      stepsAttempted: instruction.steps.length,
      observation: `Content script error: ${contentResponse.error}`,
      newUrl: null,
      domChanged: false,
      error: contentResponse.error,
    };
  }

  const { beforeSnapshot, afterSnapshot, newUrl } = contentResponse as {
    beforeSnapshot: DomSnapshot;
    afterSnapshot: DomSnapshot;
    newUrl: string | null;
  };

  console.log('[CA:interactor] Content script execution complete');
  console.log(`[CA:interactor] Before: url=${beforeSnapshot.url}, title="${beforeSnapshot.pageTitle}", events=${beforeSnapshot.eventElementCount}`);
  console.log(`[CA:interactor] After:  url=${afterSnapshot.url}, title="${afterSnapshot.pageTitle}", events=${afterSnapshot.eventElementCount}`);
  console.log(`[CA:interactor] URL changed: ${newUrl !== null} ${newUrl ? `→ ${newUrl}` : ''}`);

  console.log('[CA:interactor] Calling LLM to assess interaction result...');
  const assessment = await assessInteraction(
    instruction,
    beforeSnapshot,
    afterSnapshot,
    newUrl,
    instruction.steps.length,
    apiKey,
    provider
  );

  console.log(`[CA:interactor] Assessment: success=${assessment.success}, domChanged=${assessment.domChanged}, steps=${assessment.stepsCompleted}/${assessment.stepsAttempted}`);
  console.log(`[CA:interactor] Observation: ${assessment.observation}`);
  if (assessment.error) console.log(`[CA:interactor] Error: ${assessment.error}`);

  return assessment;
}

async function assessInteraction(
  instruction: InteractionInstruction,
  before: DomSnapshot,
  after: DomSnapshot,
  newUrl: string | null,
  totalSteps: number,
  apiKey: string | undefined,
  provider: 'gemini_key' | 'ambient_ai'
): Promise<InteractionResult> {
  const userMessage = JSON.stringify({
    instruction: {
      goal: instruction.goal,
      steps: instruction.steps,
    },
    beforeSnapshot: before,
    afterSnapshot: after,
    urlChanged: newUrl !== null,
    newUrl,
  });

  const responseText = await callLlm(INTERACTOR_SYSTEM_PROMPT, userMessage, apiKey, provider);
  return parseInteractionResponse(responseText, totalSteps);
}

// ============ LLM Routing ============

async function callLlm(
  systemPrompt: string,
  userMessage: string,
  apiKey: string | undefined,
  provider: 'gemini_key' | 'ambient_ai'
): Promise<string> {
  if (provider === 'ambient_ai') {
    return callAmbientApi('interactor', systemPrompt, userMessage);
  }

  if (!apiKey) throw new Error('No API key provided for Gemini');
  return callGeminiDirect(systemPrompt, userMessage, apiKey);
}

async function callGeminiDirect(
  systemPrompt: string,
  userMessage: string,
  apiKey: string
): Promise<string> {
  console.log('[CA:interactor] Using Gemini direct API');
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
  console.log(`[CA:interactor] Using Ambient API — role=${role}`);
  const googleToken = await getCalendarToken();

  const body = JSON.stringify({ role, system_prompt: systemPrompt, user_message: userMessage });
  console.log(`[CA:interactor] POST ${AMBIENT_API_BASE}/calendar_agent/ — body size=${body.length}`);

  const response = await fetch(`${AMBIENT_API_BASE}/calendar_agent/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${googleToken}`,
    },
    body,
  });

  console.log(`[CA:interactor] Ambient API response: status=${response.status}`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[CA:interactor] Ambient API error: ${errorText}`);
    throw new Error(`Calendar agent API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.success) {
    console.error(`[CA:interactor] Ambient API returned success=false:`, data.error);
    throw new Error(data.error || 'Unknown calendar agent API error');
  }
  console.log(`[CA:interactor] Ambient API response size: ${data.response?.length || 0} chars`);
  return data.response;
}

// ============ Response Parsing ============

function parseInteractionResponse(text: string, totalSteps: number): InteractionResult {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      success: parsed.success ?? false,
      stepsCompleted: parsed.stepsCompleted ?? 0,
      stepsAttempted: parsed.stepsAttempted ?? totalSteps,
      observation: parsed.observation || 'No observation provided',
      newUrl: parsed.newUrl || null,
      domChanged: parsed.domChanged ?? false,
      error: parsed.error || null,
    };
  } catch (e) {
    return {
      success: false,
      stepsCompleted: 0,
      stepsAttempted: totalSteps,
      observation: 'Failed to parse LLM assessment response',
      newUrl: null,
      domChanged: false,
      error: `LLM response parse error: ${e}`,
    };
  }
}
