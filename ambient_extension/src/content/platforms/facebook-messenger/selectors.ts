/**
 * CSS Selectors for Facebook Messenger DOM
 *
 * Facebook uses React with dynamically generated class names, so we rely on
 * stable data-* attributes, aria-* attributes, and role attributes.
 *
 * Last verified: March 2026
 */

export const SELECTORS = {
  /**
   * Each message (or system event) is a MWMessageRow pagelet.
   */
  MESSAGE_ROW: 'div[data-pagelet="MWMessageRow"]',

  /**
   * Date/time separators between message groups.
   * Located inside an aria-hidden div within the row's <h4>.
   * The inner span contains the parseable timestamp text.
   */
  DATE_BREAK: 'div[data-scope="date_break"]',
  DATE_BREAK_TIME_SPAN: 'div[data-scope="date_break"] span',

  /**
   * The main conversation area. Its aria-label contains the conversation title:
   *   "Conversation titled <name>"  (named group chats)
   *   "Conversation with <names>"   (unnamed groups / 1:1)
   */
  CONVERSATION_MAIN: '[role="main"]',

  /**
   * Present when a conversation is open. Used as a secondary signal for
   * isOnConversationPage().
   */
  CONVERSATION_INFO_BUTTON: '[aria-label="Conversation information"]',

  /**
   * Reaction pill elements to strip from message text.
   */
  REACTION: 'div[aria-label*="see who reacted"]',

  /**
   * "Seen by" indicators to strip from message text.
   */
  SEEN_BY: 'div[aria-label^="Seen by"]',

  /**
   * Attachment links to strip.
   */
  ATTACHMENT: 'a[aria-label^="Open Attachment"]',

  /**
   * Scroll container fallbacks.
   */
  SCROLL_CONTAINER: '[role="main"]',

  /**
   * Chat list container in the left sidebar.
   */
  CHAT_LIST: 'div[aria-label="Chats"]',

  /**
   * Individual conversation links in the chat list sidebar.
   * Messenger uses /t/ for regular chats and /e2ee/t/ for encrypted chats.
   */
  CONVERSATION_LINK: 'a[href^="/t/"], a[href^="/e2ee/t/"]',
} as const;

/**
 * Patterns for identifying non-message system rows.
 * If a MWMessageRow's textContent matches one of these and does NOT
 * contain an "Enter" button, it's a system event, not a user message.
 */
export const SYSTEM_MESSAGE_PATTERNS = [
  /added .+ to the group/,
  /created the group\./,
  /set the quick reaction to/,
  /This poll is no longer available\./,
  /left the group\./,
  /removed a participant from the group\./,
  /joined the video call\./,
  /The video call ended\./,
  /changed the group photo\./,
  /changed the group name\./,
  / set the nickname for/,
  /changed the group description\./,
  /named the group/,
  /Messages are missing\. Restore now/,
  /upgraded the security of this chat/,
] as const;

/**
 * Date format patterns for the aria-hidden date_break span text.
 *
 * Facebook uses U+202F (Narrow No-Break Space) before AM/PM in some locales,
 * so all input should be normalized before matching.
 */
export const DATE_PATTERNS = {
  /** "12/29/25, 11:16 AM" */
  SLASH_DATE: /^(\d{1,2})\/(\d{1,2})\/(\d{2}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i,

  /** "Feb 16, 2026, 2:42 PM" */
  MONTH_NAME_DATE: /^(\w{3})\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i,

  /** "Thu 6:42 PM" */
  DAY_OF_WEEK_TIME: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i,

  /** "12:41 PM" */
  TIME_ONLY: /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
} as const;

export const MONTH_ABBREV: Record<string, number> = {
  'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3,
  'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7,
  'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11,
};

export const DAY_ABBREV: Record<string, number> = {
  'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3,
  'Thu': 4, 'Fri': 5, 'Sat': 6,
};
