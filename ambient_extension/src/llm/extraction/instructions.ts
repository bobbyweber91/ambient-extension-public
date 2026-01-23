/**
 * LLM instructions for event extraction
 * Ported from ambient_v1 text_extraction_instructions.py
 */

import { getExamplesString } from './examples';
import type { ConversationDict } from '../../types';

/**
 * Generate the core instructions for event extraction
 */
export function generateInstructions(userRealName: string): string {
  const instructions = `
***** INSTRUCTIONS *****

Your task is to extract information about events the user may want to plan for from a series of text messages.

Before classifying any event, you MUST follow this sequence of checks:
 - Check for 'Not an Event' Conditions First: Your primary task is to filter out non-events. Scrutinize the messages to see if they match any criteria for not_an_event (e.g., same-day planning, user not involved, purely speculative). If they do, classify it as not_an_event and STOP. Do not proceed to the next checks.
 - Check for 'Not a Desired Event' Conditions: If the activity is a plannable event, check if the user has explicitly declined it. If so, classify as not_a_desired_event.
 - Classify the Event Type: Only if an activity passes the checks above should you classify it as full_potential_event_details, incomplete_event_details.

Crucial Rule: Events discussed for the same day (e.g., "want to grab drinks tonight?", "games in an hour?") do not require planning and should be classified as not_an_event.

Events the user may want to plan for are:
 - Events the user is considering attending (they are inviting people, they are inviting others). This does not include events they are just discussing with no one planning to attend. 
     - Do not extract events that the user does not seem to be invited to and doesn't need to plan around. 
      - Good examples of this are when someone is discussing a different event they are going to without any attempt to include the user. e.x: "Sorry I'm doing a college meet up friday." or a text to someone else in a group message "Tell everyone at the graduation that we're sorry to miss". Both of these are not_an_event
      - Events a user may want to plan around is if they are planning a day trip and someone says "Chris and I need to be back by 8 for dinner". The user may want to plan around this event if they are also going to the day trip.
 - Events that are being planned or require planning. Things that are only being discussed the day of (e.x: "want to grab drinks tonight?", "games in an hour?") do not require planning. "Lets meet up on saturday to play games" does require planning.
 - Events that are not purely speculative. "We could do dinner sometime" or "We gotta catch up sometime soon" are purely speculative. "We could do dinner one of these next weekends" is not purely speculative.


The text messages are in the following format:
{
  title: str, # the conversation title. This is often the list of participants 
  structured_messages: list[dict[date: str, sender: str, text: str]] # the list of messages in the conversation. The date is in ISO 8601 format
}

Extract information about the events into the following format:
[
{'event_type': str, # The type of event. This can be "full_potential_event_details", "incomplete_event_details", "not_a_desired_event", or "not_an_event"
  "summary": str, # A short summary of the event
  "description": str, # The description of the event
  "location": optional[str], # The location of the event
  "start": optional[dict][
    "date": optional[str], # The start date of the event
    "dateTime": optional[str], # The start time of the event
    "timeZone": optional[str], # The timezone of the event
  ],
  "end": optional[dict][
    "date": optional[str], # The end date of the event
    "dateTime": optional[str], # The end time of the event
    "timeZone": optional[str], # The timezone of the event
  ],
  "attendees": optional[str], # The attendees of the event
  "htmlLink": optional[str], # A link to the event details (e.x: a partiful link, link to a restaurant location, etc)
  "user_confirmed_attendance": optional[bool], # Whether the user confirmed attendance
  "reference_messages": optional[list[dict[date: str, sender: str, text: str]]], # The messages that were used to extract this event
},
#This is a list to support multiple events being passed as input or output
]

For optional fields, if the field is not present, omit the field entirely, do not output None or Null.

Return the output as a single, valid JSON array (a list of event objects), fully compliant with RFC 8259. Ensure that any double quotes within string values are properly escaped with a backslash.

The event type is one of the following:
 - Full_potential_event_details: Details about an event. This set has all the likely details of the event (time, date, location, who is going, etc) and doesn't reference other messages about the event. When multiple desired events exist, add each of them separately.
 - Incomplete_event_details: Similar to "full potential event details" but has references to other messages that may contain additional information. This will commonly be messages like "Yeah, let's do that" without a clear reference to what "that" is referring to. When multiple incomplete event details exist, add each of them separately. 
 - Not_a_desired_event: About an event the user (either noted as "you" or as ${userRealName}) will not want to attend. A user likely does not want to attend an event if:
    - The user was invited to the event but has said they will not attend
    - The invite comes from a conversation where the user regularly does not respond to and the user has not confirmed attendance. If you see a particular phone number is regularly (multiple times in a week) posting about different potential events with the user never confirming attendance, mark these as not a desired event.
- Not_an_event: Use this for messages that are not about a plannable, social, or group event for the user. This category is for any of the following cases:
   - Impromptu, same-day activities that do not require advance planning (e.g., "games in an hour?", "drinks tonight?").
   - A person mentioning their own individual plans that do not involve or invite the user. This is especially true for routine work or personal chores. (e.g., "Plan is to work on it tonight", "I'll finish the report tomorrow", "I need to do laundry this weekend").
   - Events the user is clearly not attending or invited to (e.g., "Sorry I'm busy with a family dinner Friday", "Tell everyone at the party I said hi").
   - Purely speculative suggestions without a concrete timeframe (e.g., "We should hang out sometime"). 
   - An ongoing commitment or hobby that does not have a discrete, plannable time block. For example, an invitation to "join my fantasy league this season" is not_an_event because the "season" is a long, continuous period. However, a specific, schedulable activity within that commitment, like a "fantasy draft next Tuesday at 8pm", would be a plannable event.
Do not ask for additional context. If you do no have enough context, return [{event_type: "not_an_event"}]

When there are multiple parts of a broader event (e.x: a day trip with multiple activities), extract each part as a separate event.

Additional instructions for annotating specific fields:
 - For location, annotate the most specific location possible. For instance if a dinner is planned at garaje in San Francisco, annotate "garaje" or a google maps link. If a link to a location is given and specific, always include the link. If the link is sent with a name, use the name and the link as the location.
 - For user_confirmed_attendance, look in the messages to see if the user confirmed their attendance. This happens when: The user is inviting someone to an event which indicates the user is going, the user responds to an invitations with an affirmation "sounds good", "I'm in", "thumbs up emoji". Responses to learn more are not indications of attendance unless the user elsewhere confirms attendance. For instance "What time" does not confirm attendance but elsewhere the user may have said "I'm in" which does confirm attendance.
 - For summary, try to capture the event type (dinner, wedding, hangout, escape room, etc) and the main person planning the event other than the user (e.x: if Garrett says "lets hang with James", he is the planner). The final name is then these two pieces of information together. Ex: "Hangout planned by Garrett" or if planned by the user: "Hangout with Garrett".
 - For description, summarize key aspects of the event. For simple meetups like dinners this will be short and similar to the event name, often something like "Dinner to catch up with Lauren" or "Escape room for Eric's birthday".
 - For attendees, list the names of individuals other than the user who are mentioned as attending, being invited, or are actively co-planning the event. If someone says they are not coming, do not add them as an attendee. If someone invites a user to an event, the inviter is an attendee.
 - For reference_messages: list the message dictionaries that were used to identify any piece of information annotated.

For start and end, annotate the dates/times an event is expected to occur. 
 - When a time or date is not specified or inferrable do not annotate it.
 - If an event has an uncertain time (e.x: 5 or 6pm, tomorrow or the day after), add "time to be confirmed" to the summary. Have the start date or time be the earliest potential time and the end date or time be the latest potential time.
 - Dates should be structured as YYYY-MM-DD (e.g., "2025-04-25")
 - If a timezone isn't clear, use America/Los_Angeles. 
 - Use logic to infer specific dates from words like "tomorrow", "in 10 days" or "next saturday". Use the date the text was sent as the reference date, then infer from there which day it is referring to. For instance a message sent 2025-05-19 saying "friday" is referring to 2025-05-23. A message sent 2025-05-19 saying "next friday" is referring to 2025-05-30.
 - If a start time is specified, but no end time is specified, add "end time to be confirmed" to the summary. Have the end time be an hour after the start time.
 - If an event's summary implies a time frame (ex: brunch implies ~11am-1pm, going out implies 10pm or later, etc) and no exact time is specified, add "time to be confirmed" to the summary. Have the start time be the earliest potential time and the end time be an hour after the start time.
 - If an event doesn't have a clear start time but there are other events before or after the event, use the end time of the previous event to infer the start time (aka: lunch at 11:30 then walk to beach means the event walk to the beach: happens at 12:30pm)
 - Be extra careful not to confuse texts from different weeks/days that use similar language but refer to different dates due to when the message was sent. For instance these two texts refer to two different dates and thus two different events:
     {text: "It's feeling better every day. I would be down for something Saturday night or Sunday. Though likely would need to be in a lying down position 😅.", date: "2025-07-17 20:57:00"} - this text is referring to 2025-07-19 and 2025-07-20
     {text: "Anyone interested in trying out Lorcana? Christina and I were gonna go to Dogpatch games this Saturday to try some of their beginner decks.", date: "2025-07-11 20:35:00"} - this text is referring to 2025-07-13
 - Some events will have their dates explicitly changed by the planners. Ex: "Let's do next saturday instead". In these cases the old event data (location, attendees, etc) should be used with the new date.
 - If an event has an uncertain date (e.x: "swedish house mafia is playing in september" doesn't have a specific date), don't annotate a date.

Specifically for incomplete events, the following instructions apply: 
 - For summary it is acceptable to use generic terms like "that" or "unknown" when required information is missing.
 - For description it is acceptable to use generic terms like "that" or "unknown" when required information is missing.

For not_a_desired_event, annotate all the information as usual to enable matching against previous events and marking them as not attended.
`.trim();

  return instructions;
}

/**
 * Generate the full event extraction prompt with instructions, examples, and input
 */
export function generateEventExtractionPrompt(
  conversation: ConversationDict,
  userRealName: string
): string {
  const instructions = generateInstructions(userRealName);
  const examples = getExamplesString();
  const conversationJson = JSON.stringify(conversation, null, 2);
  
  let prompt = instructions;
  
  if (examples) {
    prompt += '\n\n' + examples;
  }
  
  prompt += `

***** ACTUAL INPUT TO CLASSIFY *****
***** TEXT MESSAGE INPUT *****
${conversationJson}`;

  return prompt;
}
