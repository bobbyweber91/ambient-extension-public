/**
 * Few-shot examples for LLM calendar event matching
 * Ported from ambient_v1 v2_event_match_instructions_and_examples.py
 */

// Example 1: No match - completely different events
export const EXAMPLE_1_CALENDAR_EVENTS = [{
  summary: "Stay at Oceanview Resort & Spa",
  calendarName: "user@example.com",
  location: "Oceanview Resort & Spa, Mexico",
  description: "To see detailed information for automatically created events like this one, use the official Google Calendar app.",
  start: { date: "2025-05-23" },
  end: { date: "2025-05-25" },
  id: "31gp4doq39qgjsuffsr93rculo",
}];

export const EXAMPLE_1_TEXT_EVENT = {
  event_type: "full_potential_event_details",
  summary: "Copyright Law for AI planned by Alex Chen",
  description: "Copyright Law for AI planned by Alex Chen",
  location: "1 Market St, San Francisco, CA",
  attendees: "Dana",
  htmlLink: "https://partiful.com/e/22Ll6346UML8yx7drc",
  user_confirmed_attendance: true,
  reference_messages: [
    { sender: "Alex Chen", text: "https://partiful.com/e/22Ll6346UML8yx7drc" },
    { sender: "Alex Chen", text: "i'll be giving a talk on copyright law for AI if you're curious to join!" },
    { sender: "You", text: "Sounds cool. I'm in. Mind if I invite Dana?" }
  ]
};

export const EXAMPLE_1_OUTPUT = {
  match_data: {
    match_type: "no_match",
    matched_event: null,
    matched_event_id: null
  }
};

// Example 2: Certain update - matching event with new details
export const EXAMPLE_2_CALENDAR_EVENTS = [
  {
    summary: "a giant meta-celebration of everything | Partiful",
    location: "1 Market St, San Francisco, CA",
    description: "View this event on Partiful at https://partiful.com/e/22iaoern090c",
    start: { dateTime: "2025-06-01T03:00:00Z", timeZone: "UTC" },
    end: { dateTime: "2025-06-01T08:00:00Z", timeZone: "UTC" },
    id: "_dgp7chq898pmiijnc986sha7f8p4mda660",
  },
  {
    summary: "Birthday + Housewarming | Partiful",
    location: "1420 El Camino Real, San Mateo",
    description: "Priya and Raj are hosting a housewarming party",
    start: { dateTime: "2025-06-14T22:00:00Z", timeZone: "UTC" },
    end: { dateTime: "2025-06-15T00:00:00Z", timeZone: "UTC" },
    id: "_6ljnipjg9lljau355kq42l3ae1m56rr59s",
  },
];

export const EXAMPLE_2_TEXT_EVENT = {
  event_type: "full_potential_event_details",
  summary: "Birthday + Housewarming hosted by Raj & Priya",
  description: "Priya and I just moved into our new place and we'd love to have you over for our housewarming + my birthday (I'm turning 34!!!!).\n\nNo need to bring anything - just show up and we'll have beers, wine, and snacks",
  location: "San Mateo, CA",
  start: { dateTime: "2025-06-14T15:00:00-07:00", timeZone: "America/Los_Angeles" },
  attendees: "Raj, Priya",
  htmlLink: "https://partiful.com/e/eh5eiyx7dq3w46irc?",
  user_confirmed_attendance: false,
  reference_messages: [
    { sender: "You", text: "he's hosting something at his place and said to invite you: https://partiful.com/e/eh5eiyx7dq3w46irc?" }
  ]
};

export const EXAMPLE_2_OUTPUT = {
  match_data: {
    match_type: "certain_update",
    matched_event: "Birthday + Housewarming | Partiful",
    matched_event_id: "_6ljnipjg9lljau355kq42l3ae1m56rr59s",
  },
  summary: "Birthday + Housewarming hosted by Raj & Priya",
  description: "Priya and I just moved into our new place and we'd love to have you over for our housewarming + my birthday (I'm turning 34!!!!).\n\nNo need to bring anything - just show up and we'll have beers, wine, and snacks",
  htmlLink: "https://partiful.com/e/eh5eiyx7dq3w46irc?",
};

// Example 3: No match - related but different events (rehearsal vs wedding)
export const EXAMPLE_3_CALENDAR_EVENTS = [{
  id: "kftf9u44s5uj59rpiuut5einfs",
  summary: "Wedding of Brooke Adams and Ryan Adams",
  location: "Dallas, TX",
  start: { dateTime: "2025-10-30T10:30:00-07:00", timeZone: "America/Los_Angeles" },
  end: { dateTime: "2025-10-30T17:00:00-07:00", timeZone: "America/Los_Angeles" },
  description: "Wedding for Brooke and Ryan. The rehearsal is at 10:30 AM and the ceremony begins at 4:00 PM.",
}];

export const EXAMPLE_3_TEXT_EVENT = {
  reference_messages: [
    {
      date: "10/13/25, 04:42:06PM",
      sender: "Mom",
      text: "From Brooke and Ryan: The rehearsal will begin in the chapel at 10:30am..."
    }
  ],
  event_type: "full_potential_event_details",
  start: { dateTime: "2025-10-30T10:00:00-07:00", timeZone: "America/Los_Angeles" },
  end: { dateTime: "2025-10-30T11:30:00-07:00", timeZone: "America/Los_Angeles" },
  summary: "Wedding rehearsal for Brooke and Ryan",
  description: "The rehearsal for Brooke and Ryan's wedding will begin in the chapel at 10:30am...",
  attendees: "Brooke, Ryan, wedding party, Bob, Ann",
};

export const EXAMPLE_3_OUTPUT = {
  match_data: {
    match_type: "no_match",
    matched_event: null,
    matched_event_id: null
  }
};

// Example 4: No update - matching event with same information
export const EXAMPLE_4_CALENDAR_EVENTS = [{
  summary: "Night at the Theater: Co-Founders | Partiful",
  location: "Location available once RSVP'd",
  description: "RSVP at https://partiful.com/e/tre12yer13524rt\n\nWe would love to host you for an evening out at the theater...",
  start: { dateTime: "2025-06-07T01:00:00Z", timeZone: "UTC" },
  end: { dateTime: "2025-06-07T03:00:00Z", timeZone: "UTC" },
  id: "_a0qkaqi2dp8k6hb2ad1kgs9g9pk6sqr898",
}];

export const EXAMPLE_4_TEXT_EVENT = {
  event_type: "full_potential_event_details",
  summary: "Theater with Emery Clark",
  description: "unknown",
  start: { date: "June 6, 2025" },
  attendees: "Dana",
  htmlLink: "https://partiful.com/e/tre12yer13524rt",
  user_confirmed_attendance: false,
  reference_messages: [
    { sender: "Emery Clark", text: "Also! You and Dana should come to the theater with us on Friday!!" },
    { sender: "Emery Clark", text: "https://partiful.com/e/tre12yer13524rt" },
    { sender: "You", text: "oh yeah! I want to come, need to double check with the lady." }
  ]
};

export const EXAMPLE_4_OUTPUT = {
  match_data: {
    match_type: "no_update",
    matched_event: "Night at the Theater: Co-Founders | Partiful",
    matched_event_id: "_a0qkaqi2dp8k6hb2ad1kgs9g9pk6sqr898",
  }
};

/**
 * All matching examples as [calendarEvents, textEvent, output] tuples
 */
export const MATCHING_EXAMPLES = [
  [EXAMPLE_1_CALENDAR_EVENTS, EXAMPLE_1_TEXT_EVENT, EXAMPLE_1_OUTPUT],
  [EXAMPLE_2_CALENDAR_EVENTS, EXAMPLE_2_TEXT_EVENT, EXAMPLE_2_OUTPUT],
  [EXAMPLE_3_CALENDAR_EVENTS, EXAMPLE_3_TEXT_EVENT, EXAMPLE_3_OUTPUT],
  [EXAMPLE_4_CALENDAR_EVENTS, EXAMPLE_4_TEXT_EVENT, EXAMPLE_4_OUTPUT],
] as const;
