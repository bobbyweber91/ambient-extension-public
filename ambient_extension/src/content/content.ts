/**
 * Content script for Google Messages
 * Handles DOM parsing and scrolling
 */

import type { ConversationDict, ScrollMessage, ScrollBackDaysMessage, ScrollBackDaysResponse } from '../types';
import { parseConversation, isOnConversationPage, getScrollContainer } from './domParser';
import { SELECTORS, PATTERNS, MONTHS } from './selectors';

// Listen for messages from the side panel or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message.type);

  switch (message.type) {
    case 'PARSE_DOM':
      try {
        if (!isOnConversationPage()) {
          sendResponse({ 
            success: false, 
            error: 'Not on a conversation page. Please open a conversation first.' 
          });
          return true;
        }
        const conversation = parseConversation();
        sendResponse({ success: true, conversation });
      } catch (error) {
        console.error('Error parsing DOM:', error);
        sendResponse({ success: false, error: (error as Error).message });
      }
      return true;

    case 'SCROLL_CONVERSATION':
      handleScroll(message as ScrollMessage)
        .then((conversation) => sendResponse({ success: true, conversation }))
        .catch((error) => {
          console.error('Error scrolling:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    
    case 'CHECK_PAGE':
      // Check if we're on a valid conversation page
      sendResponse({ 
        success: true, 
        isOnConversation: isOnConversationPage() 
      });
      return true;

    case 'DEBUG_DOM':
      // Return diagnostic information about the DOM
      try {
        const debugInfo = getDOMDebugInfo();
        sendResponse({ success: true, debug: debugInfo });
      } catch (error) {
        sendResponse({ success: false, error: (error as Error).message });
      }
      return true;

    case 'SCROLL_BACK_DAYS':
      handleScrollBackDays(message as ScrollBackDaysMessage)
        .then((response) => sendResponse(response))
        .catch((error) => {
          console.error('Error scrolling back:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    default:
      return false;
  }
});

/**
 * Get diagnostic information about the DOM structure
 */
function getDOMDebugInfo(): object {
  // Check for message elements
  const messagePartsWithAria = document.querySelectorAll(SELECTORS.MESSAGE_TEXT_PART);
  const allMessageParts = document.querySelectorAll('mws-text-message-part');
  const messageWrappers = document.querySelectorAll(SELECTORS.MESSAGE_WRAPPER);
  
  // Get sample aria-labels
  const sampleAriaLabels: string[] = [];
  const ariaLabelMatches: any[] = [];
  
  messagePartsWithAria.forEach((el, idx) => {
    if (idx < 5) { // First 5 samples
      const label = el.getAttribute('aria-label') || '';
      sampleAriaLabels.push(label);
      
      // Test match and show detailed result
      const matchResult = label.match(PATTERNS.ARIA_LABEL);
      ariaLabelMatches.push({
        label: label.substring(0, 150) + (label.length > 150 ? '...' : ''),
        fullLength: label.length,
        matches: matchResult !== null,
        groups: matchResult ? {
          sender: matchResult[1],
          text: matchResult[2]?.substring(0, 50),
          month: matchResult[3],
          day: matchResult[4],
          year: matchResult[5],
        } : null,
      });
    }
  });
  
  // Try alternate selectors
  const altSelectors = {
    'mws-message-part': document.querySelectorAll('mws-message-part').length,
    'mws-message': document.querySelectorAll('mws-message').length,
    '[data-e2e-message-content]': document.querySelectorAll('[data-e2e-message-content]').length,
    '.text-msg': document.querySelectorAll('.text-msg').length,
    'mws-text-message-part': allMessageParts.length,
    'mws-text-message-part[aria-label]': messagePartsWithAria.length,
  };
  
  // Test the regex directly on a known sample
  const testStr = "You said: Sure!. Sent on December 20, 2025 at 11:44 AM. Delivered.";
  const testMatch = PATTERNS.ARIA_LABEL.test(testStr);
  
  // Get first aria-label and show character codes to find invisible chars
  const firstLabel = messagePartsWithAria[0]?.getAttribute('aria-label') || '';
  const charAnalysis: { char: string; code: number; position: number }[] = [];
  for (let i = 0; i < firstLabel.length; i++) {
    const code = firstLabel.charCodeAt(i);
    // Flag non-standard characters (not basic printable ASCII, or newlines)
    if (code < 32 || code > 126 || code === 160) { // 160 is non-breaking space
      charAnalysis.push({ char: `[${code}]`, code, position: i });
    }
  }
  
  // Also show chars around position 78-85 (where ". Sent" should be)
  const aroundDot = firstLabel.substring(75, 95);
  const aroundDotCodes = [];
  for (let i = 75; i < Math.min(95, firstLabel.length); i++) {
    aroundDotCodes.push({ pos: i, char: firstLabel[i], code: firstLabel.charCodeAt(i) });
  }
  
  return {
    url: window.location.href,
    isConversationPage: isOnConversationPage(),
    elementCounts: {
      'mws-text-message-part[aria-label]': messagePartsWithAria.length,
      'mws-text-message-part (any)': allMessageParts.length,
      'mws-message-wrapper': messageWrappers.length,
    },
    alternateSelectors: altSelectors,
    sampleAriaLabels: ariaLabelMatches,
    regexPattern: PATTERNS.ARIA_LABEL.source,
    regexFlags: PATTERNS.ARIA_LABEL.flags,
    testKnownSample: {
      input: testStr,
      matches: testMatch
    },
    charAnalysis: {
      firstLabelLength: firstLabel.length,
      nonAsciiChars: charAnalysis,
      aroundPosition80: aroundDot,
      aroundPosition80Codes: aroundDotCodes,
      fullLabel: firstLabel
    }
  };
}

/**
 * Scroll to load more messages
 * TODO: Implement fully in Phase 2
 */
async function handleScroll(options: ScrollMessage): Promise<ConversationDict> {
  console.log('Scrolling conversation...', options);
  
  const scrollContainer = getScrollContainer();
  if (!scrollContainer) {
    throw new Error('Could not find message scroll container');
  }
  
  // Placeholder - full scrolling logic will be implemented in Phase 2
  // For now, just parse whatever is already loaded
  return parseConversation();
}

/**
 * Normalize special space characters to regular spaces
 * (Duplicate from domParser.ts for use in content script)
 */
function normalizeSpaces(str: string): string {
  return str
    .replace(/\u202F/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\u2009/g, ' ')
    .replace(/\u200A/g, ' ');
}

/**
 * Parse the date from a message's aria-label
 * Returns a Date object or null if parsing fails
 */
function getMessageDate(ariaLabel: string): Date | null {
  const normalizedLabel = normalizeSpaces(ariaLabel);
  const match = normalizedLabel.match(PATTERNS.ARIA_LABEL);
  if (!match) return null;

  const [, , , month, day, year, hour, minute, ampm] = match;
  
  const monthNum = MONTHS[month];
  if (monthNum === undefined) return null;
  
  // Convert 12-hour to 24-hour format
  let hour24 = parseInt(hour, 10);
  if (ampm === 'PM' && hour24 !== 12) {
    hour24 += 12;
  } else if (ampm === 'AM' && hour24 === 12) {
    hour24 = 0;
  }
  
  return new Date(parseInt(year, 10), monthNum, parseInt(day, 10), hour24, parseInt(minute, 10));
}

/**
 * Get the oldest (topmost) message element and its date
 */
function getOldestMessage(): { element: Element; date: Date } | null {
  const messageParts = document.querySelectorAll(SELECTORS.MESSAGE_TEXT_PART);
  if (messageParts.length === 0) return null;
  
  // The first message in DOM order is the oldest (topmost)
  const firstMessage = messageParts[0];
  const ariaLabel = firstMessage.getAttribute('aria-label');
  if (!ariaLabel) return null;
  
  const date = getMessageDate(ariaLabel);
  if (!date) return null;
  
  return { element: firstMessage, date };
}

/**
 * Wait for a specified number of milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Find the scroll container using multiple fallback selectors
 */
function findScrollContainer(): Element | null {
  // Try the primary selector first
  let container = document.querySelector(SELECTORS.MESSAGE_SCROLL_CONTAINER);
  if (container) return container;
  
  // Try fallback selectors
  for (const selector of SELECTORS.MESSAGE_SCROLL_CONTAINER_FALLBACKS) {
    container = document.querySelector(selector);
    if (container) {
      console.log('[Ambient] Found scroll container with fallback selector:', selector);
      return container;
    }
  }
  
  // Last resort: find a scrollable parent of the first message
  const firstMessage = document.querySelector(SELECTORS.MESSAGE_TEXT_PART);
  if (firstMessage) {
    let parent = firstMessage.parentElement;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        console.log('[Ambient] Found scroll container via scrollable parent:', parent.tagName, parent.className);
        return parent;
      }
      parent = parent.parentElement;
    }
  }
  
  return null;
}

/**
 * Handle scrolling back by a specified number of days
 * Scrolls up until we reach messages from X days ago
 */
async function handleScrollBackDays(message: ScrollBackDaysMessage): Promise<ScrollBackDaysResponse> {
  console.log('[Ambient] Scrolling back', message.days, 'days');
  
  if (!isOnConversationPage()) {
    return { success: false, error: 'Not on a conversation page' };
  }
  
  // Calculate target date (current date - X days, at start of day)
  const now = new Date();
  const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - message.days);
  targetDate.setHours(0, 0, 0, 0);
  
  console.log('[Ambient] Target date:', targetDate.toISOString());
  
  // Try to find scroll container (optional - we can still scroll without it)
  const scrollContainer = findScrollContainer();
  if (scrollContainer) {
    console.log('[Ambient] Found scroll container:', scrollContainer.tagName, scrollContainer.className);
  } else {
    console.log('[Ambient] No scroll container found, will use scrollIntoView only');
  }
  
  // Maximum number of scroll attempts to prevent infinite loops
  const maxAttempts = 100;
  let attempts = 0;
  let previousOldestDate: Date | null = null;
  let stuckCount = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    // Get the oldest message currently in DOM
    const oldestMessage = getOldestMessage();
    if (!oldestMessage) {
      return { 
        success: false, 
        error: 'Could not find any messages' 
      };
    }
    
    console.log('[Ambient] Oldest message date:', oldestMessage.date.toISOString(), 'attempt:', attempts);
    
    // Check if we've reached our target date
    if (oldestMessage.date <= targetDate) {
      console.log('[Ambient] Reached target date!');
      return { 
        success: true, 
        reachedTarget: true,
        oldestMessageDate: oldestMessage.date.toISOString()
      };
    }
    
    // Check if we're stuck (same oldest date as before)
    if (previousOldestDate && oldestMessage.date.getTime() === previousOldestDate.getTime()) {
      stuckCount++;
      if (stuckCount >= 3) {
        // We've been stuck for 3 attempts, probably reached the beginning
        console.log('[Ambient] Reached beginning of conversation');
        return { 
          success: true, 
          reachedTarget: false,
          oldestMessageDate: oldestMessage.date.toISOString()
        };
      }
    } else {
      stuckCount = 0;
    }
    previousOldestDate = oldestMessage.date;
    
    // Scroll the oldest message into view (this should trigger loading of older messages)
    oldestMessage.element.scrollIntoView({ behavior: 'instant', block: 'start' });
    
    // Also scroll the container to the top if we found one
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
    
    // Wait for new messages to potentially load
    await delay(500);
  }
  
  // If we get here, we exceeded max attempts
  const finalOldest = getOldestMessage();
  return { 
    success: true, 
    reachedTarget: false,
    oldestMessageDate: finalOldest?.date.toISOString()
  };
}

// Log when content script loads
console.log('Ambient Extension content script loaded on:', window.location.href);

// Notify that we're ready
if (isOnConversationPage()) {
  console.log('Detected Google Messages conversation page');
}
