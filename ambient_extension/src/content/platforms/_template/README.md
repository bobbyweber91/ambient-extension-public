# Adding a New Messaging Platform

Follow these steps to add support for a new messaging platform (e.g. WhatsApp Web).

## 1. Create a platform folder

```
src/content/platforms/<platform-name>/
  selectors.ts   # CSS selectors and regex patterns for the platform's DOM
  parser.ts      # Class implementing MessagePlatform
  index.ts       # Re-export the platform class
```

## 2. Implement `selectors.ts`

Define the CSS selectors needed to find conversation titles, message elements, and scroll containers in the platform's DOM. Keep them in a single `SELECTORS` object so they're easy to update when the UI changes.

## 3. Implement the platform class in `parser.ts`

Your class must implement the `MessagePlatform` interface from `../types`:

```typescript
import type { MessagePlatform, PlatformConfig } from '../types';
import type { ConversationDict } from '../../../types';

export class WhatsAppPlatform implements MessagePlatform {
  config: PlatformConfig = {
    id: 'whatsapp',
    name: 'WhatsApp Web',
    urlPatterns: [/web\.whatsapp\.com/],
  };

  isOnConversationPage(): boolean { /* ... */ }
  parseConversation(): ConversationDict { /* ... */ }
  getScrollContainer(): Element | null { /* ... */ }
  getOldestMessage(): { element: Element; date: Date } | null { /* ... */ }
}
```

The key contract:

- **`isOnConversationPage()`** -- return `true` when the user has a conversation open.
- **`parseConversation()`** -- read the DOM and return a `ConversationDict` with `title`, `participants`, and `structured_messages`.
- **`getScrollContainer()`** -- return the scrollable element that holds messages (used by the scroll-back logic).
- **`getOldestMessage()`** -- return the topmost (oldest) message element and its parsed `Date`, used by the scroll-back-days feature.

## 4. Export from `index.ts`

```typescript
export { WhatsAppPlatform } from './parser';
```

## 5. Register in `registry.ts`

Add your platform to the `platforms` array in `src/content/platforms/registry.ts`:

```typescript
import { WhatsAppPlatform } from './whatsapp';

const platforms: MessagePlatform[] = [
  new GoogleMessagesPlatform(),
  new WhatsAppPlatform(),
];
```

## 6. Update `manifest.json`

Add the new host to `content_scripts[0].matches` and `host_permissions`:

```json
"content_scripts": [
  {
    "matches": [
      "https://messages.google.com/*",
      "https://web.whatsapp.com/*"
    ],
    "js": ["content.js"]
  }
],
"host_permissions": [
  "https://messages.google.com/*",
  "https://web.whatsapp.com/*",
  "https://tryambientai.com/*"
]
```

## Tips

- Prefer `aria-label` and `data-*` attributes over class names when possible -- they tend to be more stable.
- Use the `getDOMDebugInfo()` pattern (see `google-messages/parser.ts`) during development to inspect the live DOM structure.
- The `StructuredMessage` format (`date`, `sender`, `text`) is the universal output -- all downstream processing (LLM extraction, calendar matching) works with this format regardless of source platform.
