/**
 * Field difference computation for calendar event matching
 * Ported from ambient_v1 calendar_update_utils.py
 */

import type { 
  CalendarEvent, 
  DateTimeInfo, 
  FieldDifferences, 
  MatchResult, 
  MatchType 
} from '../../types';

/**
 * Determine differences between a calendar event and a matched/updated event
 * Returns only the fields that have changed
 */
export function determineDifferences(
  calendarEvent: CalendarEvent,
  matchedEvent: Partial<CalendarEvent>
): FieldDifferences {
  const differences: FieldDifferences = {};

  // Check summary
  if (
    matchedEvent.summary &&
    calendarEvent.summary !== matchedEvent.summary &&
    matchedEvent.summary !== 'null'
  ) {
    differences.summary = {
      old: calendarEvent.summary || '',
      new: matchedEvent.summary,
    };
  }

  // Check description
  if (
    matchedEvent.description &&
    calendarEvent.description !== matchedEvent.description &&
    matchedEvent.description !== 'null'
  ) {
    differences.description = {
      old: calendarEvent.description || '',
      new: matchedEvent.description,
    };
  }

  // Check location
  if (
    matchedEvent.location &&
    calendarEvent.location !== matchedEvent.location &&
    matchedEvent.location !== 'null'
  ) {
    differences.location = {
      old: calendarEvent.location || '',
      new: matchedEvent.location,
    };
  }

  // Check start date/time
  if (matchedEvent.start && !isDateTimeEqual(calendarEvent.start, matchedEvent.start)) {
    // Special handling: if calendar has dateTime and match has only date on same day, skip
    if (!shouldSkipDateUpdate(calendarEvent.start, matchedEvent.start)) {
      differences.start = {
        old: calendarEvent.start || {},
        new: matchedEvent.start,
      };
    }
  }

  // Check end date/time
  if (matchedEvent.end && !isDateTimeEqual(calendarEvent.end, matchedEvent.end)) {
    if (!shouldSkipDateUpdate(calendarEvent.end, matchedEvent.end)) {
      differences.end = {
        old: calendarEvent.end || {},
        new: matchedEvent.end,
      };
    }
  }

  return differences;
}

/**
 * Check if two DateTimeInfo objects are equal
 */
function isDateTimeEqual(a?: DateTimeInfo, b?: DateTimeInfo): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;

  // If both have dateTime, compare those
  if (a.dateTime && b.dateTime) {
    return a.dateTime === b.dateTime;
  }

  // If both have date, compare those
  if (a.date && b.date) {
    return a.date === b.date;
  }

  // Mixed date and dateTime - not equal
  return false;
}

/**
 * Check if we should skip a date update
 * Returns true if calendar has dateTime and match has only date on same day
 */
function shouldSkipDateUpdate(calendarDate?: DateTimeInfo, matchedDate?: DateTimeInfo): boolean {
  if (!calendarDate || !matchedDate) return false;

  const calendarDateTime = calendarDate.dateTime;
  const matchedDateOnly = matchedDate.date;
  const matchedDateTime = matchedDate.dateTime;

  // If calendar has dateTime and matched event has only date (no dateTime)
  if (
    calendarDateTime &&
    matchedDateOnly &&
    !matchedDateTime
  ) {
    try {
      // Parse the calendar dateTime to get the date
      const calendarDt = new Date(calendarDateTime);
      const calendarDateStr = calendarDt.toISOString().split('T')[0];

      // Parse the matched date
      const matchedDt = new Date(matchedDateOnly);
      const matchedDateStr = matchedDt.toISOString().split('T')[0];

      // If they're on the same day, skip the update (preserve the more precise dateTime)
      return calendarDateStr === matchedDateStr;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Categorize match results by match type
 */
export function categorizeMatchResults(matchResults: MatchResult[]): {
  no_match: MatchResult[];
  no_update: MatchResult[];
  certain_update: MatchResult[];
  possible_update: MatchResult[];
} {
  const categorized = {
    no_match: [] as MatchResult[],
    no_update: [] as MatchResult[],
    certain_update: [] as MatchResult[],
    possible_update: [] as MatchResult[],
  };

  for (const result of matchResults) {
    // Skip events that should not be processed
    if (result.extracted_event.event_type === 'not_a_desired_event') {
      continue;
    }

    // Skip events without start date
    if (!result.extracted_event.start) {
      continue;
    }

    const matchType = result.match_type;
    
    if (matchType === 'no_match') {
      categorized.no_match.push(result);
    } else if (matchType === 'no_update') {
      categorized.no_update.push(result);
    } else if (matchType === 'certain_update') {
      categorized.certain_update.push(result);
    } else if (matchType === 'possible_update') {
      categorized.possible_update.push(result);
    }
  }

  return categorized;
}

/**
 * Format a DateTimeInfo for display
 */
export function formatDateTimeForDisplay(dateTime?: DateTimeInfo): string {
  if (!dateTime) return 'Not set';

  if (dateTime.dateTime) {
    try {
      const date = new Date(dateTime.dateTime);
      return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateTime.dateTime;
    }
  }

  if (dateTime.date) {
    try {
      const date = new Date(dateTime.date + 'T00:00:00');
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateTime.date;
    }
  }

  return 'Not set';
}

/**
 * Check if there are any meaningful differences
 */
export function hasDifferences(differences?: FieldDifferences): boolean {
  if (!differences) return false;
  
  return !!(
    differences.summary ||
    differences.description ||
    differences.location ||
    differences.start ||
    differences.end
  );
}
