/**
 * Calendar event matching module
 * Handles matching extracted events against calendar events
 */

export { matchAllEventsToCalendar, matchEventToCalendar } from './matchEvents';
export { generateMatchInstructions } from './instructions';
export { 
  findPotentialMatches, 
  getMatchingCalendarEvents,
  getEmbeddings,
  cosineSimilarity
} from './embeddingSimilarity';
export { 
  determineDifferences, 
  categorizeMatchResults,
  formatDateTimeForDisplay,
  hasDifferences
} from './fieldDiff';
export { MATCHING_EXAMPLES } from './examples';
