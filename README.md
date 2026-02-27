# Ambient Extension

**Turn your chaotic group chat into Google Calendar events in 30 seconds.**

The Ambient Extension extracts plans, dates, and events from your group messages and adds them directly to your calendar.

No account required. No message storage.

---

## Install

### Option 1: Chrome Web Store (Stable)

[**Add to Chrome**](https://chromewebstore.google.com/detail/ambient-messages-to-calen/fedgpihjlpnogfhomofkdiamhlklndmk) — one-click install from the Chrome Web Store.

### Option 2: Download Latest from GitHub

For the most recent version (may be ahead of the Web Store):

1. Download `ambient_extension_v*.zip` from the [**latest release**](https://github.com/bobbyweber91/ambient-extension-public/releases/latest)
2. Unzip the file
3. Open `chrome://extensions/` in Chrome
4. Enable **Developer mode** (top right toggle)
5. Click **Load unpacked** (top left)
6. Select the unzipped folder

To update: download the new release zip, replace your existing files, and click the refresh icon on the extension card in `chrome://extensions/`.

### Option 3: Build from Source

```bash
cd ambient_extension
npm install
npm run build
```

Then load the `ambient_extension/dist` folder as an unpacked extension (same steps 3–6 above).

---

## How It Works

1. Open your group chat on [messages.google.com](https://messages.google.com)
2. Click the Ambient extension icon
3. Hit "Extract Events" — AI identifies all the plans in your conversation
4. Review and add events to your Google Calendar

---

## Purpose

This is the open-source repository for the Ambient Chrome Extension and its backend API. We've made this public to:

1. **Provide transparency** — See how we process your data without any long-term storage.
2. **Enable community contributions** — Found a bug? Want to support a new messaging platform? PRs welcome.

---

## File Structure

```
extension/
├── ambient_extension/       # Chrome extension (TypeScript)
│   ├── src/
│   │   ├── background/      # Service worker
│   │   ├── content/         # DOM parsing & message extraction
│   │   ├── sidepanel/       # Extension UI
│   │   ├── llm/             # AI prompt templates (extraction & matching)
│   │   └── types/           # TypeScript type definitions
│   ├── manifest.json        # Extension manifest
│   ├── webpack.config.js    # Build configuration
│   └── package.json         # Dependencies
│
├── extension_endpoint/      # Django API (Python)
│   ├── views.py             # API endpoints
│   ├── validators.py        # Request validation
│   ├── urls.py              # URL routing
│   └── apps.py              # Django app config
│
└── __init__.py              # Package init
```

---

## Chrome Extension (`ambient_extension/`)

The extension runs entirely in your browser. It only activates when you explicitly click the extension icon.

### Content Script (`src/content/`)

Responsible for reading messages from the page DOM:

- **`content.ts`** — Main entry point; listens for commands from the sidepanel
- **`domParser.ts`** — Extracts message text, sender, and timestamp from Google Messages DOM
- **`selectors.ts`** — CSS selectors and regex patterns for parsing different message formats

The content script:
- Only runs on `messages.google.com`
- Only activates when you click "Extract Events"
- Reads visible messages from the DOM (never accesses your Google account or message history beyond what's displayed)

### Sidepanel (`src/sidepanel/`)

The extension's user interface:

- Displays extracted events for review
- Handles Google OAuth for calendar access
- Manages the extraction → review → add-to-calendar flow

### LLM Prompts (`src/llm/`)

Templates for AI-powered extraction and matching:

- **`extraction/`** — Prompts that tell Gemini how to identify events in conversation text
- **`matching/`** — Prompts for comparing extracted events against your existing calendar (to avoid duplicates)

These prompts are included in the extension but the actual AI calls go through to the LLM API of your choice.
---

## Backend API (`extension_endpoint/`)

A Django app that proxies AI requests through Ambient's Gemini API. This exists so users don't need to configure their own API keys.

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/extension_endpoint/extract_event/` | POST | Extract events from conversation text |
| `/extension_endpoint/find_matches/` | POST | Match extracted event against calendar events |
| `/extension_endpoint/health/` | GET | API health check |
| `/extension_endpoint/check_profile/` | GET | Check if user has an Ambient account |

### Privacy Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         YOUR BROWSER                                │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │ Google Messages │ -> │ Content Script  │ -> │ Side Panel      │ │
│  │ (DOM only)      │    │ (parses text)   │    │ (shows events)  │ │
│  └─────────────────┘    └─────────────────┘    └────────┬────────┘ │
└─────────────────────────────────────────────────────────┼──────────┘
                                                          │
                                              Conversation text
                                                          │
                                                          v
┌─────────────────────────────────────────────────────────────────────┐
│                       AMBIENT API                                   │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │ Validate        │ -> │ Call Gemini     │ -> │ Return events   │ │
│  │                 │    │                 │    │                 │ │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**What we receive:** Conversation text (messages, timestamps, sender names) and Calendar information  
**What we store:** Nothing. Zero retention. Requests are processed and discarded.  
**What we log:** Request counts for rate limiting (by anonymized user ID)

### Authentication & Rate Limiting

- Requests require a Google OAuth token (used only to verify you're a real user)
- Rate limits: 5 requests/day (anonymous) or 10 requests/day (with Ambient account)
- Your Google token is verified but we don't store any Google account data

### Key Files

- **`views.py`** — API endpoint implementations with CORS, auth, and rate limiting
- **`validators.py`** — Input validation for conversation and event objects

---

## Development

### Extension

```bash
cd ambient_extension
npm install
npm run build     # Production build
npm run dev       # Watch mode with hot reload
```

### Backend

The `extension_endpoint` Django app requires Python 3.10+, Django 4.2+, and a `DEFAULT_API_KEY` setting with a valid Gemini API key.

---

## Contributing

We welcome contributions! Here's how:

1. **Bug reports** — Open an issue with reproduction steps
2. **Feature requests** — Open an issue describing the use case
3. **Pull requests** — Fork, create a branch, submit a PR

---

## License

MIT License — see [LICENSE](ambient_extension/LICENSE) for details.

---

## Links

- [Ambient Website](https://tryambientai.com)
- [Chrome Web Store](https://chromewebstore.google.com/detail/ambient-messages-to-calen/fedgpihjlpnogfhomofkdiamhlklndmk)
- [Report an Issue](https://github.com/bobbyweber91/ambient-extension-public/issues)
