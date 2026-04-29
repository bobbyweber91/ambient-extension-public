/**
 * ICS file parser using ical.js.
 * Converts raw ICS content into ExtractedEvent objects.
 */

import ICAL from 'ical.js';
import type { ExtractedEvent } from '../types';

export function parseIcsContent(icsContent: string): ExtractedEvent[] {
  const jcalData = ICAL.parse(icsContent);
  const comp = new ICAL.Component(jcalData);
  const vevents: any[] = comp.getAllSubcomponents('vevent');
  const events: ExtractedEvent[] = [];

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    try {
      const summary = event.summary || 'Untitled Event';
      const location = event.location || undefined;
      const description = event.description || '';

      const dtstart: any = event.startDate;
      const dtend: any = event.endDate;
      const isAllDay = dtstart.isDate;

      let recurrenceNote = '';
      const rruleProp = vevent.getFirstProperty('rrule');
      if (rruleProp) {
        const rruleStr = rruleProp.getFirstValue()?.toString() || null;
        if (rruleStr) {
          recurrenceNote = `\nRecurrence: ${rruleStr}`;
        }
      }

      const extracted: ExtractedEvent = {
        event_type: 'full_potential_event_details',
        summary,
        description: description + recurrenceNote,
        location,
      };

      if (isAllDay) {
        extracted.start = { date: dtstart.toString().substring(0, 10) };
        if (dtend) {
          extracted.end = { date: dtend.toString().substring(0, 10) };
        }
      } else {
        extracted.start = { dateTime: dtstart.toJSDate().toISOString() };
        if (dtend) {
          extracted.end = { dateTime: dtend.toJSDate().toISOString() };
        }
      }

      events.push(extracted);
    } catch (e) {
      console.warn('[Ambient] Failed to parse VEVENT:', e);
    }
  }

  return events;
}
