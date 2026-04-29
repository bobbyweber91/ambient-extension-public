# Extractor Agent Instructions

See existing extractor instructions.

The Extractor's interface with the orchestrator is defined in contracts.md under `ExtractionResult`. It receives content (DOM HTML, `.ics` file contents, or JSON data) and returns a list of `ExtractedEvent` objects with a date range and confidence assessment.

## Integration Notes

The Extractor must handle three content types:

### HTML (DOM content)
- Receives the cleaned DOM of the current page
- Extracts events with summary, dates, times, location, description
- Must handle varied formats: calendar grids, event lists, agenda views, individual event pages
- When times are ambiguous or missing, use `start.date` (all-day) instead of `start.dateTime`
- Do not estimate end times — omit `end` if unknown; the downstream UI handles missing end times
- Include `timeZone` in `start`/`end` when determinable from page context
- Include `attendees` if the page lists people attending
- Include `htmlLink` if the event links to a detail page

### ICS (iCalendar file content)
- Receives raw `.ics` file content as a string
- Parse VEVENT components using the `ical.js` library (do not regex parse ics files)
- Map DTSTART/DTEND to `start`/`end` with `date` or `dateTime` as appropriate
- Map SUMMARY to `summary`, LOCATION to `location`, DESCRIPTION to `description`
- Append RRULE information to `description` if present (e.g., "Recurs: weekly on Mondays")

### JSON (API response or schema.org data)
- Receives raw JSON
- If schema.org/Event format: map `name`→`summary`, `startDate`→`start.dateTime`, `location`→`location`, etc.
- If unknown JSON format: use the LLM to identify which fields map to event properties

## Output Contract

Always return:
```typescript
{
  events: ExtractedEvent[],
  dateRange: { earliest: string, latest: string } | null,
  confidence: "high" | "medium" | "low",
  notes: string | null
}
```

Where each `ExtractedEvent` has:
```typescript
{
  event_type: "full_potential_event_details" | "not_an_event",
  summary: string,
  description?: string,
  location?: string,
  start?: { date?: string, dateTime?: string, timeZone?: string },
  end?: { date?: string, dateTime?: string, timeZone?: string },
  attendees?: string,
  htmlLink?: string
}
```

Set `confidence` to:
- `"high"`: clear, unambiguous event data with explicit dates and times
- `"medium"`: events found but some fields were inferred or ambiguous
- `"low"`: uncertain whether extracted items are actually calendar events

Deduplication is handled by the orchestrator, not the Extractor. The orchestrator computes a hash of `lowercase(summary) + start date/time + lowercase(location)` and deduplicates across all extraction results in the session.
