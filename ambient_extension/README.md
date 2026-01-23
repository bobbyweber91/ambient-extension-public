# Ambient Extension

A Chrome extension that extracts calendar events from Google Messages conversations using AI and syncs them to Google Calendar.

## Features

- Parses Google Messages web interface to extract conversation data
- Uses Gemini AI to identify events mentioned in conversations
- Matches extracted events against existing Google Calendar entries
- Creates or updates calendar events automatically

## Installation

### Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ambient_extension.git
   cd ambient_extension
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### Configuration

1. **Gemini API Key**: Get a free API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

2. **Google Calendar OAuth**: 
   - Create a project in [Google Cloud Console](https://console.cloud.google.com/)
   - Enable the Google Calendar API
   - Create OAuth 2.0 credentials for a Chrome Extension
   - Update `manifest.json` with your client ID

## Usage

1. Navigate to [Google Messages](https://messages.google.com)
2. Open a conversation
3. Click the extension icon to open the side panel
4. Click "Extract Events" to analyze the conversation
5. Review detected events and confirm calendar updates

## Development

```bash
# Watch mode for development
npm run dev

# Production build
npm run build

# Clean build artifacts
npm run clean
```

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
