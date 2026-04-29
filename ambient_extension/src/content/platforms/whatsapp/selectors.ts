/**
 * CSS Selectors for WhatsApp Web DOM
 *
 * WhatsApp Web's DOM uses obfuscated class names but a few stable hooks:
 *  - `[data-pre-plain-text]` on each message bubble carries "[H:MM AM/PM, D/M/YYYY] Sender Name: "
 *  - `[role="row"]` wraps each message
 *  - `header` near the top of the chat pane carries the conversation title
 *
 * Last verified: April 2026. WhatsApp Web changes occasionally — fall back to the
 * alternative selectors when the primary ones return nothing.
 */

export const SELECTORS = {
  /**
   * Conversation title — appears in the header above the message pane.
   * The first child element with `title` attribute or `<span>` content.
   */
  CONVERSATION_TITLE_PRIMARY: '[data-testid="conversation-info-header"] span[title]',
  CONVERSATION_TITLE_FALLBACKS: [
    'header span[dir="auto"][title]',
    '#main header span[title]',
    'header [role="button"] span[title]',
  ],

  /**
   * Message rows. Each message is rendered as a [role="row"] within the message list.
   */
  MESSAGE_ROW: 'div[role="row"]',

  /**
   * The `data-pre-plain-text` attribute on or inside a row carries the metadata stamp:
   *   "[10:24 AM, 4/27/2026] Sarah: "
   * It's present for both sent and received messages.
   */
  PRE_PLAIN_TEXT: '[data-pre-plain-text]',

  /**
   * The visible message text inside a row — selectable text spans.
   */
  MESSAGE_TEXT: 'span.selectable-text, span._ao3e.selectable-text',
  MESSAGE_TEXT_FALLBACK: 'span[dir="ltr"], span[dir="rtl"], span[dir="auto"]',

  /**
   * Scroll container for the message pane. WhatsApp uses an inner div with `role="application"`
   * sometimes, otherwise a parent of the message rows.
   */
  MESSAGE_SCROLL_CONTAINER_FALLBACKS: [
    'div[data-tab="8"]',           // message list scroll container in many builds
    '#main div.copyable-area',
    '#main [role="application"]',
    '#main div[tabindex="0"]',
  ],

  /**
   * Conversation list items in the left sidebar.
   * Each chat row has role="listitem" with a span[title] showing the chat name.
   */
  CONVERSATION_LIST_ITEM: '#pane-side div[role="listitem"]',
  CONVERSATION_LIST_ITEM_NAME: 'span[title]',
} as const;

/**
 * Patterns for parsing the data-pre-plain-text stamp.
 *
 * Format examples:
 *   "[10:24 AM, 4/27/2026] Sarah Johnson: "
 *   "[22:14, 27/4/2026] You: "
 *
 * WhatsApp uses the user's locale for time + date format, which varies.
 * This regex tolerates 12h/24h time and either M/D/YYYY or D/M/YYYY date order;
 * the caller resolves ambiguity at the date-build step.
 */
export const PATTERNS = {
  PRE_PLAIN_TEXT: /^\[\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\s*,\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*\]\s*([^:]+?):\s*$/i,

  /**
   * Skip patterns for system / non-content messages we shouldn't include.
   * WhatsApp doesn't expose a dedicated marker for these — heuristic skip.
   */
  SKIP_PATTERNS: [
    /^‎/,   // left-to-right mark often prefixes system messages
  ],
} as const;
