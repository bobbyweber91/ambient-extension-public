/**
 * LLM instructions for calendar event matching
 * Ported from ambient_v1 v2_event_match_instructions_and_examples.py
 */

import type { ExtractedEvent, CalendarEvent } from '../../types';
import { MATCHING_EXAMPLES } from './examples';

/**
 * Generate the matching prompt for comparing a text event to calendar events
 */
export function generateMatchInstructions(
  textEvent: ExtractedEvent,
  calendarEvents: CalendarEvent[]
): string {
  // Clean up calendar events for display (remove "Created by: Ambient" and links)
  const cleanedCalendarEvents = calendarEvents.map(event => {
    const cleaned = { ...event };
    if (cleaned.description) {
      cleaned.description = cleaned.description
        .replace('Created by: Ambient', '')
        .replace(/\nLink:.*\n*$/g, '');
    }
    return cleaned;
  });

  // Build the prompt
  let prompt = EVENT_MATCH_INSTRUCTIONS_BASE;
  prompt += EXAMPLES_HEADER;
  prompt += formatExamples();
  prompt += REAL_INPUT_SIGNIFIER;
  prompt += CALENDAR_INPUT_HEADER;
  prompt += JSON.stringify(cleanedCalendarEvents, null, 2);
  prompt += TEXT_INPUT_HEADER;
  prompt += JSON.stringify(textEvent, null, 2);

  return prompt;
}

const EXAMPLES_HEADER = `
***** EXAMPLES *****
Below are some examples of text inputs and the correct outputs.
`;

const INPUT_START_HEADER = `
***** INPUT START*****
`;

const CALENDAR_INPUT_HEADER = `
***** CALENDAR INPUT *****
`;

const TEXT_INPUT_HEADER = `
***** TEXT INPUT *****
`;

const OUTPUT_HEADER = `
***** OUTPUT *****
`;

const REAL_INPUT_SIGNIFIER = `***** ACTUAL INPUT TO CLASSIFY, NOT EXAMPLE *****
`;

const EVENT_MATCH_INSTRUCTIONS_BASE = `
Compare events from a user's calendar to an event extracted from their text messages to analyze if the text message event matches any of the calendar event and it does, what inforation from the calendar event should be updated to include information from the text event. 

Output the response as a JSON object (exact format below) that says if the events are a match and what (if any) information from the calendar event should be updated to include information from the text event.

An event is a match if when looking at the summary, description, attendees (if available), time, reference messages,and location, they are likely referring to the same event. For instance:
 - Compare the uniqueness and similarity of summaries and descriptions. The more unique and similar they are, the more likely they are referring to the same event.
     - For uniqueness:
        - Not unique summaries are: Lunch, Dinner, Meeting, etc.
        - Somewhat unique summaries are: Poker Night, Bros Lunch, halloween party, Game planned by eric, etc
        - Very unique summaries are: Copyright law talk, Halloween karaspookay, etc
     - For similarity:
         - Not similar summaries are: 
            - "Birthday trip for Nate and Will from July 24th-27th" is not similar to "Dinner with nate july 24th". The dinner is happening on the trip but is not the same as the overall trip and should not be matched.
           - "Game planned by eric" is not similar to "copyright talk planned by eric". A copyright talk is not a game even though they both have the same person planning them.
           - "Bobby:Deepshikha" is not similar to "Bobby:Eliza". Deepshikha and Eliza are not the same person.
         - Somewhat similar summaries are:
           - "Game night" is somewhat similar to "poker night". Poker is a game
           - "Bros lunch" is somewhat similar to "lunch with jimmy, nathan and eliza". Bros often refers to a group of friends
           - "Halloween karaspookay" is somewhat similar to "halloween party". They are both referring to halloween and it isnt clear what a karaspookay is.
         - somewhat similar descriptions are"
           - "various activities like grilling, brunch, beach visits, dinner at Dolce Fantasia with a bar crawl, minigolf" is somewhat similar to "beach trip" because beach trip isn't very descriptive and all the activities are reasonably likely to happen on a trip
         - Very similar summaries are:
           - "The cursed amulet" is very similar to "Julio presents: the cursed amulet". The cursed amulet is a very unique summary and "Julio presents" doesn't really change the meaning of the event.
           - "Copyright law talk" is very similar to "Copyright Law for AI"
    - Combining the two, here is how strong a match two summaries are:
      - Game night and poker night are a somewhat strong match, they are somewhat similar and somewhat unique
      - Game night with eric and poker night with eric are a strong match as they are somewhat similar any pretty unique
      - Beach trip and hangout on the beach are a somewhat strong match as they are somewhat similar and somewhat unique
 - Then compare the times/dates and update the likelihood of a match based on how similar they are. Exact time/date matches are a strong indication of a match. The further apart the times/dates are, the weaker the match.
   - An event that may be multiple days long with a date vs an event that has a specific time is not likely a match. For instance "beach trip" with a date is less likely to be a match than "beach hangout" with a time.
   - If there are two lunch with Mojan events on the same day but different times, they are likely a match because they are very similar and it is pretty common for lunch times to change
   - If there are two lunch with mojan events within 7 days of each other, they are somewhat likely to be a match, if they are more than 7 days apart, they are not likely a match. As they are only somewhat likely, make sure to check the descriptions and reference messages to confirm.
   - Lunch with eliza and nathan at the same time as lunch with nathan is likely a match as they are the same time and have at least one attendee in common. Lunch with eliza at the same time as lunch with nathan is not likely a match even though they are the same time
 - Analyze Semantic Consistency for Contradictions:
   - Even if the person and timeframe are close, check if the descriptions describe fundamentally different activities or logic.
   - Activity Conflict: If one event is "Dinner with Jimbo" and the other is "Chat with Jimbo before his dinner," these are not a match. The activity "Dinner" is different from "Time killing before Dinner."
   - Logical Conflict: If the calendar event implies the user is participating in an activity (e.g., "Dinner at Sichuan place") and the text event implies the user is accommodating that activity elsewhere (e.g., "End by 6pm so Jimbo can go to dinner"), they are not a match.
 - Finally look at the reference messages and see if they explain any differences between the events. For instance:
   - If there are two lunches with mojan 10 days away from each other but there is a reference text from mojan saying "can we do next friday instead" then they are very likely to be a match. It was the earlier date, but Mojan moved it to a much later date.
   - If there are references messages where the event is referred to as a "game night" and a "poker night" then they are very likely to be a match.
   - If there is an event called "dinner with eric" and an event called "lunch with eric" and a reference message from eric saying "can we do dinner instead" then they are very likely to be a match.

First decide if an event is a match. Then if it is, decide what information from the calendar event should be updated to include information from the text event. 
 - Use the text event's information when it adds specificity. 
   - For example if the calendar description said "beach trip" and the text message said "Stay in red hook, pizza dinner friday, grilling saturday" then replace the previous description entirely
   - San Francisco is a more specific location than California. If the text event said "San Francisco" then use "San Francisco" instead of "California". If the calendar event said "San Francisco" and the text event said "California" then there is no need for an update
 - Use the text event's information when it is in conflict with previous information. For instance if the calendar time had been 11:30 but text time is 12:30 then replace the calendar time with the text time
 - Combine information when it is not in conflict. For example if the calendar description said "Beach trip with nathan, jimmy and eliza" and the text message said "pizza dinner friday, grilling saturday" then combine the two descriptions to "beach trip with nathan, jimmy, eliza. pizza dinner friday, grilling saturday"
 - Only annotate information that is changing. If both events have the same time, don't annotate a time. 
 - If an event is a match but has no updates, annotate no update. 
 - For start and end field, if a datetime exists and is more precise, don't add a date field.
 - Ignore the attendees field. It is not used to determine if an event is a match.
 - Don't add reference messages as part of the output.

Return the output as a single, valid JSON object, fully compliant with RFC 8259. Ensure that any double quotes within string values are properly escaped with a backslash.


Here is an example of the output format:
{
"match_data": {
  "match_type": ["no_match", "no_update", "certain_update"],
  "matched_event": [calendar event summary if matched, null otherwise],
  "matched_event_id": [calendar event id if matched, null otherwise],
  }
  "summary": str, # A short summary of the event if changed
  "description": str, # The description of the event if changed
  "location": optional[str], # The location of the event if changed
  "start": optional[dict][
    "date": optional[str], # The start date of the event if changed
    "dateTime": optional[str], # The start time of the event if changed
    "timeZone": optional[str], # The timezone of the event if changed
  ],
  "end": optional[dict][
    "date": optional[str], # The end date of the event if changed
    "dateTime": optional[str], # The end time of the event
    "timeZone": optional[str], # The timezone of the event
  ],
  "htmlLink": optional[str]
}
  
`;

/**
 * Format all examples into a string
 */
function formatExamples(): string {
  let result = '';
  
  MATCHING_EXAMPLES.forEach((example, idx) => {
    result += INPUT_START_HEADER + `Input example ${idx}: `;
    result += CALENDAR_INPUT_HEADER + JSON.stringify(example[0], null, 2);
    result += TEXT_INPUT_HEADER + JSON.stringify(example[1], null, 2);
    result += OUTPUT_HEADER + `Output example ${idx}: ` + JSON.stringify(example[2], null, 2) + '\n\n';
  });

  return result;
}
