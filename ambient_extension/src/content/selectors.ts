/**
 * CSS Selectors for Google Messages DOM
 * 
 * These are centralized here to make updates easier if Google changes their DOM structure.
 * Last verified: January 2026
 */

export const SELECTORS = {
  /**
   * Conversation title - the h2 inside the header title container
   * For 1:1 chats: just the contact name
   * For group chats: comma-separated list of participant names
   */
  CONVERSATION_TITLE: '[data-e2e-header-title] h2',
  
  /**
   * Alternative title selector if the header isn't available
   * This is in the conversation list sidebar
   */
  CONVERSATION_TITLE_FALLBACK: '.title-container .title h2',
  
  /**
   * Currently selected conversation in the list (for title fallback)
   */
  SELECTED_CONVERSATION_NAME: 'a.list-item.selected [data-e2e-conversation-name]',

  /**
   * Message text elements with aria-label containing sender and message info
   * The aria-label format is: "[Sender] said: [text]. Received on [Month] [Day], [Year] at [H:MM AM/PM]."
   */
  MESSAGE_TEXT_PART: 'mws-text-message-part[aria-label]',
  
  /**
   * Message wrapper that contains message metadata
   * Attributes:
   * - is-outgoing: "true" for user's own messages
   * - msg-id: unique message ID
   */
  MESSAGE_WRAPPER: 'mws-message-wrapper',
  
  /**
   * Fallback text content selector
   */
  MESSAGE_TEXT_CONTENT: '.text-msg.msg-content, [data-e2e-message-content]',
  
  /**
   * Participant display name (fallback for sender)
   */
  PARTICIPANT_DISPLAY_NAME: '.participant-display-name-text',
  
  /**
   * Message container that scrolls (for scrolling functionality)
   * Try multiple selectors as Google may change DOM structure
   */
  MESSAGE_SCROLL_CONTAINER: '.msg-list',
  MESSAGE_SCROLL_CONTAINER_FALLBACKS: [
    '.msg-list',
    '[data-e2e-message-list]',
    'mws-messages-list',
    'mws-conversation-container',
    '.conversation-container',
    '[role="list"]',
  ],
} as const;

/**
 * Regex patterns for parsing message aria-labels
 */
export const PATTERNS = {
  /**
   * Pattern to extract sender, text, and date from aria-label
   * Groups: [1] sender, [2] message text, [3] month, [4] day, [5] year, [6] hour, [7] minute, [8] AM/PM
   * 
   * Handles both incoming and outgoing message formats:
   * - Incoming: "Rebekah W said: Hello. Received on December 20, 2025 at 11:43 AM. End-to-end encrypted."
   * - Outgoing: "You said: Hi there. Sent on December 20, 2025 at 11:44 AM. Read. End-to-end encrypted."
   * - With status: "You said: Sure!. Sent on December 20, 2025 at 11:44 AM. Delivered."
   * - SMS/MMS: "You said: Hello. Sent on January 15, 2026 at 2:23 PM. SMS."
   * - End-to-end encrypted (RCS): ends with "End-to-end encrypted."
   * - With reactions: "Mom said: Hello. Received on January 17, 2026 at 11:24 AM. Rebekah W reacted with love."
   */
  ARIA_LABEL: /^(.+?) said: (.*)\. (?:Received|Sent) on (\w+) (\d+), (\d+) at (\d+):(\d+) (AM|PM)\.(?:\s*(?:Delivered|Read|Sending|Not sent|SMS|MMS)\.)?(?:\s*End-to-end encrypted\.)?(?:\s*.+ reacted with [^.]+\.)?$/s,
  
  /**
   * Messages to skip (reactions, replies, etc.)
   * These don't contain actual conversation content
   */
  SKIP_PATTERNS: [
    /^reacted:/i,
    /^Liked\s/i,
    /^Loved\s/i,
    /^Laughed at\s/i,
    /^Emphasized\s/i,
    /^Questioned\s/i,
    /^Removed\s/i,
    /^Replied to a message:/i,
    /^Waiting for attachment/i,
  ],
} as const;

/**
 * Month name to number mapping for date parsing
 */
export const MONTHS: Record<string, number> = {
  'January': 0,
  'February': 1,
  'March': 2,
  'April': 3,
  'May': 4,
  'June': 5,
  'July': 6,
  'August': 7,
  'September': 8,
  'October': 9,
  'November': 10,
  'December': 11,
};
