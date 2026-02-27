/**
 * Event extraction module
 * Handles extracting events from text conversations
 */

export { extractEvents, extractEventsFromFile, parseExtractedEvents, filterActionableEvents } from './extractEvents';
export { generateInstructions, generateEventExtractionPrompt } from './instructions';
export { EXTRACTION_EXAMPLES, getExamplesString } from './examples';
