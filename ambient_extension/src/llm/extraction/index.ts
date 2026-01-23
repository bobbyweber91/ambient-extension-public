/**
 * Event extraction module
 * Handles extracting events from text conversations
 */

export { extractEvents, parseExtractedEvents, filterActionableEvents } from './extractEvents';
export { generateInstructions, generateEventExtractionPrompt } from './instructions';
export { EXTRACTION_EXAMPLES, getExamplesString } from './examples';
