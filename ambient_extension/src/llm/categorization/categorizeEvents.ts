/**
 * Event categorization via Ambient API.
 * Groups extracted events into meaningful categories for filtering.
 * Always routes through the Ambient backend — no direct API key needed.
 */

import { getCalendarToken } from '../../lib/calendarAuth';
import type { ExtractedEvent, EventCategory } from '../../types';

const AMBIENT_API_BASE = 'https://tryambientai.com/extension_endpoint';

const CATEGORY_COLORS = [
  '#7877c6', // ambient purple
  '#e53e3e', // red
  '#ed8936', // orange
  '#48bb78', // green
  '#4ecdc4', // teal
  '#9333ea', // violet
  '#ec4899', // pink
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#8b5cf6', // purple
];

function buildCategorizationPrompt(events: { index: number; summary: string; description?: string }[]): string {
  const eventLines = events.map(e => {
    let line = `[${e.index}] "${e.summary}"`;
    if (e.description && e.description !== e.summary) {
      const desc = e.description.length > 120 ? e.description.slice(0, 120) + '...' : e.description;
      line += ` — ${desc}`;
    }
    return line;
  }).join('\n');

  return `You are categorizing school calendar events for a parent. Assign every event to one or more categories.

Use these priority categories (use them ONLY if matching events exist):
1. "Days Off / Early Dismissal" — school closures, holidays, half days, early pickup, no school
2. "First & Last Days" — first day of school, last day, start/end of terms
3. "Parent Attendance Expected" — parent-teacher conferences, open houses, orientations, back-to-school nights
4. "School: <name>" — if event titles or descriptions clearly indicate a specific school or campus, create a category for it. Use the shortest clear name. Example: if events say "Murdock-Portal Elementary" create "School: Murdock-Portal". If events say "All Schools (Except Murdock-Portal)" create "School: All Schools (Except Murdock-Portal)". Only create School categories when the school name is explicitly stated.

Then for any remaining events:
- Group team/club activities by their specific activity: e.g. "Girls Basketball", "Band", "Robotics Club"
- Group similar academic events together: e.g. "Exams & Testing", "Report Cards"
- Group school-wide events: e.g. "School Spirit Events", "Fundraisers"
- Give every group a short, descriptive label (NOT "Other")
- If only 1-2 events remain that truly don't fit elsewhere, you may use a single "General Events" group

IMPORTANT: An event CAN appear in multiple categories. For example, "No School - Murdock-Portal" should appear in BOTH "Days Off / Early Dismissal" AND "School: Murdock-Portal". Assign events to every category that applies.

Return JSON — an array of objects, each with:
- "label": the category name (string)
- "eventIndices": array of integer indices from the list below

Every event index must appear in at least one category. Do not skip any.

Events:
${eventLines}`;
}

export async function categorizeEvents(
  events: ExtractedEvent[],
): Promise<EventCategory[]> {
  const inputs = events.map((e, i) => ({
    index: i,
    summary: e.summary,
    description: e.description || undefined,
  }));

  if (inputs.length === 0) return [];

  const prompt = buildCategorizationPrompt(inputs);
  console.log('[Ambient] Categorization prompt length:', prompt.length);

  const responseText = await callAmbientApi(prompt);
  console.log('[Ambient] Categorization response length:', responseText.length);

  return parseCategorizeResponse(responseText, events.length);
}

async function callAmbientApi(userMessage: string): Promise<string> {
  console.log('[Ambient] Categorization via Ambient API');
  const googleToken = await getCalendarToken();

  const body = JSON.stringify({
    role: 'categorizer',
    system_prompt: 'You categorize school calendar events into groups for filtering.',
    user_message: userMessage,
  });

  const response = await fetch(`${AMBIENT_API_BASE}/calendar_agent/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${googleToken}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Categorization API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Categorization API error');
  }
  return data.response;
}

function parseCategorizeResponse(responseText: string, eventCount: number): EventCategory[] {
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);

  const rawCategories: Array<{ label: string; eventIndices: number[] }> = Array.isArray(parsed) ? parsed : parsed.categories ?? [];

  // Events can appear in multiple categories, so no deduplication across categories
  const covered = new Set<number>();
  const categories: EventCategory[] = rawCategories.map((cat, i) => {
    const indices = (cat.eventIndices || []).filter((idx: number) => {
      if (typeof idx !== 'number' || idx < 0 || idx >= eventCount) return false;
      return true;
    });
    // Deduplicate within a single category
    const unique = [...new Set(indices)];
    for (const idx of unique) covered.add(idx);
    return {
      id: `cat_${i}`,
      label: cat.label,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      eventIndices: unique,
    };
  }).filter(c => c.eventIndices.length > 0);

  // Catch any events not assigned to any category
  if (covered.size < eventCount) {
    const orphans: number[] = [];
    for (let i = 0; i < eventCount; i++) {
      if (!covered.has(i)) orphans.push(i);
    }
    if (orphans.length > 0) {
      const existing = categories.find(c => c.label.toLowerCase().includes('general'));
      if (existing) {
        existing.eventIndices.push(...orphans);
      } else {
        categories.push({
          id: `cat_${categories.length}`,
          label: 'General Events',
          color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length],
          eventIndices: orphans,
        });
      }
    }
  }

  return categories;
}
