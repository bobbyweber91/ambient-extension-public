/**
 * Few-shot examples for LLM event extraction
 * Auto-generated from ambient_v1 text_extraction_examples.py
 */

interface ExampleMessage {
  date?: string;
  sender: string;
  sender_nickname?: string;
  text: string | null;
  event_details?: any[];
}

interface ExampleInput {
  title: string;
  participants?: string[];
  user_name_in_conversation?: string;
  structured_messages: ExampleMessage[];
}

interface ExampleOutput {
  event_type: string;
  previous_event_summary?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  attendees?: string;
  htmlLink?: string;
  user_confirmed_attendance?: boolean;
  oldest_message_date?: string;
  newest_message_date?: string;
  reference_messages?: ExampleMessage[];
}

// Example 1
const input1: ExampleInput = {
  "title": "Alex Chen",
  "participants": [
    "Alex Chen"
  ],
  "structured_messages": [
    {
      "date": "04/17/25, 06:31:00PM",
      "sender": "Alex Chen",
      "text": " just got back last night . "
    },
    {
      "date": "04/17/25, 06:31:00PM",
      "sender": "Alex Chen",
      "text": " caught something when I was home . "
    },
    {
      "date": "04/17/25, 08:01:00PM",
      "sender": "You",
      "text": " Oh damn, sorry to hear that. "
    },
    {
      "date": "04/17/25, 08:01:00PM",
      "sender": "You",
      "text": " Once you're better let's hang!. "
    },
    {
      "date": "04/17/25, 11:16:00PM",
      "sender": "Alex Chen",
      "text": " for sure . "
    },
    {
      "date": "04/17/25, 11:16:00PM",
      "sender": "Alex Chen",
      "text": " for sure . "
    },
    {
      "date": "04/24/25, 01:26:00AM",
      "sender": "Alex Chen",
      "text": " https://partiful.com/e/22Ll6346UML8yx7drc. "
    },
    {
      "date": "04/24/25, 01:27:00AM",
      "sender": "Alex Chen",
      "text": " just getting better finally. . "
    },
    {
      "date": "04/24/25, 01:27:00AM",
      "sender": "Alex Chen",
      "text": " gonna be playing this Friday night. "
    },
    {
      "date": "04/24/25, 01:27:00AM",
      "sender": "Alex Chen",
      "text": " my set is 10-11 so also early bird compatible haha . "
    }
  ]
};

const output1: ExampleOutput[] = [
  {
    "event_type": "full_potential_event_details",
    "summary": "Set, planned by Alex Chen",
    "description": "Alex Chen set, early bird compatible",
    "start": {
      "dateTime": "2025-04-25T22:00:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "end": {
      "dateTime": "2025-04-25T23:00:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "htmlLink": "https://partiful.com/e/22Ll6346UML8yx7drc",
    "user_confirmed_attendance": false,
    "reference_messages": [
      {
        "sender": "Alex Chen",
        "text": "https://partiful.com/e/22Ll6346UML8yx7drc. ",
        "date": "04/24/25, 01:26:00AM"
      },
      {
        "sender": "Alex Chen",
        "text": "gonna be playing this Friday night. ",
        "date": "04/24/25, 01:27:00AM"
      },
      {
        "sender": "Alex Chen",
        "text": "my set is 10-11 so also early bird compatible haha . ",
        "date": "04/24/25, 01:27:00AM"
      }
    ]
  }
];

// Example 2
const input2: ExampleInput = {
  "title": "Alex Chen",
  "participants": [
    "Alex Chen"
  ],
  "structured_messages": [
    {
      "date": "2025-04-17 18:31:00",
      "sender": "Alex Chen",
      "text": " just got back last night . "
    },
    {
      "date": "2025-04-17 18:31:00",
      "sender": "Alex Chen",
      "text": " caught something when I was home . "
    },
    {
      "date": "2025-04-17 20:01:00",
      "sender": "You",
      "text": " Oh damn, sorry to hear that. "
    },
    {
      "date": "2025-04-17 20:01:00",
      "sender": "You",
      "text": " Once you're better let's hang!. "
    },
    {
      "date": "2025-04-17 23:16:00",
      "sender": "Alex Chen",
      "text": " for sure . "
    },
    {
      "date": "2025-04-17 23:16:00",
      "sender": "Alex Chen",
      "text": " for sure . "
    },
    {
      "date": "2025-04-24 01:26:00",
      "sender": "Alex Chen",
      "text": " https://partiful.com/e/22Ll6346UML8yx7drc. "
    },
    {
      "date": "2025-04-24 01:27:00",
      "sender": "Alex Chen",
      "text": " just getting better finally. . "
    },
    {
      "date": "2025-04-24 01:27:00",
      "sender": "Alex Chen",
      "text": " gonna be playing this Friday night. "
    },
    {
      "date": "2025-04-24 01:27:00",
      "sender": "Alex Chen",
      "text": " my set is 10-11 so also early bird compatible haha . "
    },
    {
      "date": "2025-04-24 01:27:00",
      "sender": "Alex Chen",
      "text": " my set is 10-11 so also early bird compatible haha . "
    },
    {
      "date": "2025-04-25 15:32:00",
      "sender": "You",
      "text": " Dang. "
    },
    {
      "date": "2025-04-25 15:33:00",
      "sender": "You",
      "text": " Looks like probably not tonight, next time though. "
    }
  ]
};

const output2: ExampleOutput[] = [
  {
    "event_type": "not_a_desired_event",
    "summary": "Set, planned by Alex Chen",
    "description": "Alex Chen set, early bird compatible",
    "start": {
      "dateTime": "2025-04-25T22:00:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "end": {
      "dateTime": "2025-04-25T23:00:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "htmlLink": "https://partiful.com/e/22Ll6346UML8yx7drc",
    "user_confirmed_attendance": false,
    "reference_messages": [
      {
        "date": "2025-04-24 01:26:00",
        "sender": "Alex Chen",
        "text": "https://partiful.com/e/22Ll6346UML8yx7drc. "
      },
      {
        "date": "2025-04-24 01:27:00",
        "sender": "Alex Chen",
        "text": "gonna be playing this Friday night. "
      },
      {
        "date": "2025-04-24 01:27:00",
        "sender": "Alex Chen",
        "text": "my set is 10-11 so also early bird compatible haha . "
      },
      {
        "date": "2025-04-25 15:32:00",
        "sender": "You",
        "text": "Looks like probably not tonight, next time though. "
      }
    ]
  }
];

// Example 6
const input6: ExampleInput = {
  "title": "Resource bandits",
  "participants": [
    "Jordan",
    "Sam",
    "Chris Park",
    "Jamie",
    "Morgan Smith",
    "Taylor Jones",
    "Riley Brown"
  ],
  "structured_messages": [
    {
      "date": "2025-04-18 06:58:00",
      "sender": "Jordan",
      "text": " Also! Please find time to go over the feedback you gathered the folks you observed! Hopefully, you guys got a sense for the different flavors of investors (angel / solo seed / institutional seed), and how to evaluate whether they could be the right partners.. "
    },
    {
      "date": "2025-04-18 06:58:00",
      "sender": "Jordan",
      "text": " *for. "
    },
    {
      "date": "2025-04-18 07:13:00",
      "sender": "Chris Park",
      "text": " Loved an image. "
    },
    {
      "date": "2025-04-18 08:29:00",
      "sender": "Morgan Smith",
      "text": " Great session. "
    },
    {
      "date": "2025-04-18 08:36:00",
      "sender": "Morgan Smith",
      "text": " https://x.com/paulg/status/1912549145564594442?t=CfJH4iDEvtIZxdjOpE-w7A&s=19. "
    },
    {
      "date": "2025-04-18 08:37:00",
      "sender": "Morgan Smith",
      "text": " @sam. "
    },
    {
      "date": "2025-04-18 11:15:00",
      "sender": "Riley Brown",
      "text": " Happy Friday \nFrom last weekend's escape room!. "
    },
    {
      "date": "2025-04-18 11:15:00",
      "sender": "Riley Brown",
      "text": null
    },
    {
      "date": "2025-04-18 11:16:00",
      "sender": "Jordan",
      "text": " Loved an image. "
    },
    {
      "date": "2025-04-18 11:16:00",
      "sender": "Chris Park",
      "text": " Loved an image. "
    },
    {
      "date": "2025-04-18 11:16:00",
      "sender": "Jordan",
      "text": " Did you guys escape?!. "
    },
    {
      "date": "2025-04-18 11:16:00",
      "sender": "Riley Brown",
      "text": " Claro que si! . "
    },
    {
      "date": "2025-04-18 11:16:00",
      "sender": "Riley Brown",
      "text": " Have you met us??? . "
    },
    {
      "date": "2025-04-18 11:17:00",
      "sender": "Jordan",
      "text": " Love it.. "
    },
    {
      "date": "2025-04-18 11:17:00",
      "sender": "Sam",
      "text": " Loved an image. "
    },
    {
      "date": "2025-04-18 13:25:00",
      "sender": "Jordan",
      "text": " For some inspiration:. "
    },
    {
      "date": "2025-04-18 13:25:00",
      "sender": "Jordan",
      "text": " https://podcasts.apple.com/us/podcast/ted-radio-hour/id523121474?i=1000703883065. "
    },
    {
      "date": "2025-04-18 14:56:00",
      "sender": "Jordan",
      "text": " In case anyone wants to join me tomorrow (YOLO):. "
    },
    {
      "date": "2025-04-18 14:57:00",
      "sender": "Jordan",
      "text": " https://www.academymuseum.org/en/programs/detail/enter-the-matrix-conversation-with-lyndon-barrois-and-lilly-wachowski-0194d759-e1c1-161c-46f4-bb9c272bcbba. "
    },
    {
      "date": "2025-04-18 17:33:00",
      "sender": "Morgan Smith",
      "text": " Looks awesome, but have too many loose ends to deal with right now!. "
    },
    {
      "date": "2025-04-18 18:00:00",
      "sender": "Jamie",
      "text": " Loved an image. "
    },
    {
      "date": "2025-04-18 18:01:00",
      "sender": "Jamie",
      "text": " Reacted \ud83d\udd25 to an image. "
    }
  ]
};

const output6: ExampleOutput[] = [
  {
    "event_type": "full_potential_event_details",
    "summary": "Event planned by Jordan",
    "description": "Event planned by Jordan",
    "location": "City Museum",
    "start": {
      "date": "2025-04-19"
    },
    "end": {},
    "htmlLink": "https://www.academymuseum.org/en/programs/detail/enter-the-matrix-conversation-with-lyndon-barrois-and-lilly-wachowski-0194d759-e1c1-161c-46f4-bb9c272bcbba",
    "user_confirmed_attendance": false,
    "reference_messages": [
      {
        "sender": "Jordan",
        "text": " In case anyone wants to join me tomorrow (YOLO):. "
      },
      {
        "sender": "Jordan",
        "text": " https://www.academymuseum.org/en/programs/detail/enter-the-matrix-conversation-with-lyndon-barrois-and-lilly-wachowski-0194d759-e1c1-161c-46f4-bb9c272bcbba. "
      }
    ]
  }
];

// Example 7
const input7: ExampleInput = {
  "title": "poker frands",
  "participants": [
    "Meta AI",
    "Alex Chen",
    "Blake Wilson",
    "Drew Taylor",
    "Casey Miller",
    "Quinn Davis",
    "Avery Moore",
    "Kai Anderson",
    "Casey"
  ],
  "structured_messages": [
    {
      "date": "05/19/25, 04:25:00PM",
      "sender_nickname": "Alex Chen",
      "sender": "Alex Chen",
      "text": "hello fellow gambling fiends"
    },
    {
      "date": "05/19/25, 04:25:01PM",
      "sender_nickname": "Alex Chen",
      "sender": "Alex Chen",
      "text": "planning for thurs evening for poker at our spot\n\n2733 folsom st\n\nwe will add more folks as they join"
    },
    {
      "date": "05/19/25, 05:26:00PM",
      "sender_nickname": "Quinn Davis",
      "sender": "Quinn Davis",
      "text": "I know some folks we can invite - are we shooting for 8-9 total?"
    },
    {
      "date": "05/19/25, 05:26:01PM",
      "sender_nickname": "Alex Chen",
      "sender": "Alex Chen",
      "text": "yeah that sounds right !"
    },
    {
      "date": "05/19/25, 05:26:02PM",
      "sender_nickname": "Quinn Davis",
      "sender": "Quinn Davis",
      "text": "awesome"
    },
    {
      "date": "05/19/25, 05:26:03PM",
      "sender_nickname": "Quinn Davis",
      "sender": "Quinn Davis",
      "text": "Look who I found"
    },
    {
      "date": "05/19/25, 05:26:04PM",
      "sender_nickname": "Kai Anderson",
      "sender": "Kai Anderson",
      "text": ""
    },
    {
      "date": "05/19/25, 05:26:04PM",
      "sender_nickname": "Kai Anderson",
      "sender": "Kai Anderson",
      "text": ""
    },
    {
      "date": "05/19/25, 05:26:04PM",
      "sender_nickname": "Kai Anderson",
      "sender": "Kai Anderson",
      "text": ""
    },
    {
      "date": "05/19/25, 08:42:00PM",
      "sender_nickname": "Avery Moore",
      "sender": "Avery Moore",
      "text": "We have room for one more?"
    },
    {
      "date": "05/19/25, 09:08:00PM",
      "sender_nickname": "Avery Moore",
      "sender": "Avery Moore",
      "text": "Blake Wilson is down if so"
    },
    {
      "date": "05/19/25, 09:43:00PM",
      "sender_nickname": "Alex Chen",
      "sender": "Alex Chen",
      "text": "yes!"
    },
    {
      "date": "05/19/25, 09:43:01PM",
      "sender_nickname": "Avery Moore",
      "sender": "Avery Moore",
      "text": ""
    },
    {
      "date": "05/19/25, 10:36:00PM",
      "sender_nickname": "Alex Chen",
      "sender": "Alex Chen",
      "text": "OK lads will be a cash game so that people can join & leave and different times if they need\n\nthinking .1/.2 or .25/.5 blinds (suggested $40-60 ish buy-in). rebuys allowed\n\n8pm start work for everyone?"
    },
    {
      "date": "05/19/25, 11:55:00PM",
      "sender_nickname": "Alex Chen",
      "sender": "Alex Chen",
      "text": "Alex unsent a message"
    },
    {
      "date": "05/20/25, 04:09:00PM",
      "sender_nickname": "Alex Chen",
      "sender": "Alex Chen",
      "text": ""
    },
    {
      "date": "05/20/25, 04:09:01PM",
      "sender_nickname": "Alex Chen",
      "sender": "Alex Chen",
      "text": "@Avery Moore this arrived in my signal DMs. should I invite him to poker?? seems like a long lost friend of yours"
    },
    {
      "date": "05/20/25, 04:09:02PM",
      "sender_nickname": "Alex Chen",
      "sender": "Alex Chen",
      "text": "and when were you going to show us your shoulder tat??"
    },
    {
      "date": "05/20/25, 04:36:00PM",
      "sender_nickname": "Quinn Davis",
      "sender": "Quinn Davis",
      "text": "btw it looks like we're at 7 so far - y'all want to shoot for an 8th person? I have some leads"
    },
    {
      "date": "05/20/25, 04:36:01PM",
      "sender_nickname": "Quinn Davis",
      "sender": "Quinn Davis",
      "text": "(if you're ok with it @Alex Chen)"
    },
    {
      "date": "05/20/25, 04:36:02PM",
      "sender_nickname": "Alex Chen",
      "sender": "Alex Chen",
      "text": "yes ofc!"
    },
    {
      "date": "05/20/25, 06:31:00PM",
      "sender_nickname": "Avery Moore",
      "sender": "Avery Moore",
      "text": "When do we want to start?"
    },
    {
      "date": "05/20/25, 06:31:01PM",
      "sender_nickname": "Avery Moore",
      "sender": "Avery Moore",
      "text": "8?"
    },
    {
      "date": "05/20/25, 06:31:02PM",
      "sender_nickname": "Quinn Davis",
      "sender": "Quinn Davis",
      "text": "8p is the plan per above, yeah"
    },
    {
      "date": "05/20/25, 06:31:03PM",
      "sender_nickname": "Avery Moore",
      "sender": "Avery Moore",
      "text": "Ah crap great lol"
    },
    {
      "date": "05/20/25, 06:31:04PM",
      "sender_nickname": "Alex Chen",
      "sender": "Alex Chen",
      "text": "good idea @Avery Moore"
    },
    {
      "date": "05/20/25, 06:31:05PM",
      "sender_nickname": "Avery Moore",
      "sender": "Avery Moore",
      "text": "Thanks"
    },
    {
      "date": "05/20/25, 06:31:06PM",
      "sender_nickname": "You",
      "sender": "Casey",
      "text": "Blake replied to Avery\nOriginal message:\nWhen do we want to start?\nHe\u2019s starting the mind games already "
    }
  ]
};

const output7: ExampleOutput[] = [
  {
    "event_type": "full_potential_event_details",
    "summary": "Poker with Alex Chen",
    "description": "Poker night at Alex Chen's place, cash game with .1/.2 or .25/.5 blinds, $40-60 buy-in, rebuys allowed.",
    "location": "1 Market St, San Francisco, CA",
    "start": {
      "dateTime": "2025-05-22T20:00:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "end": {},
    "attendees": "Blake Wilson, Avery Moore, Quinn Davis",
    "user_confirmed_attendance": false,
    "reference_messages": [
      {
        "date": "05/19/25, 04:25:01PM",
        "sender": "Alex Chen",
        "text": "planning for thurs evening for poker at our spot\n\n2733 folsom st\n\nwe will add more folks as they join"
      },
      {
        "date": "05/19/25, 08:42:00PM",
        "sender": "Avery Moore",
        "text": "We have room for one more?"
      },
      {
        "date": "05/19/25, 09:08:00PM",
        "sender": "Avery Moore",
        "text": "Blake Wilson is down if so"
      },
      {
        "date": "05/19/25, 09:43:00PM",
        "sender": "Alex Chen",
        "text": "yes!"
      },
      {
        "date": "05/19/25, 10:36:00PM",
        "sender": "Alex Chen",
        "text": "OK lads will be a cash game so that people can join & leave and different times if they need\n\nthinking .1/.2 or .25/.5 blinds (suggested $40-60 ish buy-in). rebuys allowed\n\n8pm start work for everyone?"
      },
      {
        "date": "05/20/25, 06:31:00PM",
        "sender": "Avery Moore",
        "text": "When do we want to start?"
      },
      {
        "date": "05/20/25, 06:31:01PM",
        "sender": "Avery Moore",
        "text": "8?"
      },
      {
        "date": "05/20/25, 06:31:02PM",
        "sender": "Quinn Davis",
        "text": "8p is the plan per above, yeah"
      }
    ]
  }
];

// Example 8
const input8: ExampleInput = {
  "title": "Devon Harris",
  "participants": [
    "Devon Harris"
  ],
  "structured_messages": [
    {
      "date": "2025-05-13 10:35:00",
      "sender": "Devon Harris",
      "text": " yo. "
    },
    {
      "date": "2025-05-13 10:36:00",
      "sender": "Devon Harris",
      "text": " Heads up that I'm gonna work from my place today.  Need to get a couple loads of laundry done and stuff for tomorrow. "
    },
    {
      "date": "2025-05-13 10:36:00",
      "sender": "You",
      "text": " sg sg. "
    },
    {
      "date": "2025-05-13 10:36:00",
      "sender": "You",
      "text": " catch up at 1 ish?. "
    },
    {
      "date": "2025-05-13 10:36:00",
      "sender": "Devon Harris",
      "text": " can we do a call now?. "
    },
    {
      "date": "2025-05-13 10:37:00",
      "sender": "Devon Harris",
      "text": " Want to give you a quick update before I make any big changes. "
    },
    {
      "date": "2025-05-13 10:38:00",
      "sender": "Devon Harris",
      "text": " I need like 10 mins if you're in the middle of something. "
    },
    {
      "date": "2025-05-13 10:38:00",
      "sender": "Devon Harris",
      "text": " whenever you're free. "
    },
    {
      "date": "2025-05-13 10:39:00",
      "sender": "You",
      "text": " ok. "
    },
    {
      "date": "2025-05-13 10:39:00",
      "sender": "You",
      "text": " 11. "
    },
    {
      "date": "2025-05-13 10:39:00",
      "sender": "You",
      "text": " ?. "
    },
    {
      "date": "2025-05-13 10:41:00",
      "sender": "Devon Harris",
      "text": " sounds good. "
    },
    {
      "date": "2025-05-13 10:41:00",
      "sender": "Devon Harris",
      "text": " sounds good. "
    },
    {
      "date": "2025-05-13 11:12:00",
      "sender": "You",
      "text": " Ok, pushed a commit. "
    },
    {
      "date": "2025-05-13 11:12:00",
      "sender": "You",
      "text": " I'll let you merge. "
    },
    {
      "date": "2025-05-13 11:13:00",
      "sender": "You",
      "text": " The main thing I didn't mention earlier is that I needed to add a \"beat\" celery process. "
    },
    {
      "date": "2025-05-13 11:47:00",
      "sender": "Devon Harris",
      "text": " sounds good, we can revisit celery lol. "
    },
    {
      "date": "2025-05-13 12:05:00",
      "sender": "Devon Harris",
      "text": " Are you using another instance of Redis as well?. "
    },
    {
      "date": "2025-05-13 12:06:00",
      "sender": "Devon Harris",
      "text": " nvm, looks like youre using the same redis, but a new queue. "
    },
    {
      "date": "2025-05-13 12:12:00",
      "sender": "You",
      "text": " Exactly. "
    },
    {
      "date": "2025-05-15 14:25:00",
      "sender": "Devon Harris",
      "text": " Yoo. "
    },
    {
      "date": "2025-05-15 14:25:00",
      "sender": "Devon Harris",
      "text": " I know I said we could do celery later but I'm looking at it and it felt weird we've got two celery instances going. "
    },
    {
      "date": "2025-05-15 14:25:00",
      "sender": "Devon Harris",
      "text": " Why aren't we using the django instance with multiple queues?. "
    },
    {
      "date": "2025-05-15 15:39:00",
      "sender": "You",
      "text": " we could, I figured longterm we might put them on different instances so I separated them. "
    },
    {
      "date": "2025-05-15 15:44:00",
      "sender": "Devon Harris",
      "text": " I was doing some reading on how celery on Django works and I think it\u2019d be fine . "
    },
    {
      "date": "2025-05-15 15:44:00",
      "sender": "Devon Harris",
      "text": " When you spin up celery workers using the celery command it gains the Django context for db access and other things. "
    },
    {
      "date": "2025-05-15 15:44:00",
      "sender": "Devon Harris",
      "text": " Which is nice. "
    },
    {
      "date": "2025-05-15 15:44:00",
      "sender": "Devon Harris",
      "text": " It can also write results to db as well . "
    },
    {
      "date": "2025-05-19 18:26:00",
      "sender": "You",
      "text": " When are you back?. "
    },
    {
      "date": "2025-05-19 19:33:00",
      "sender": "Devon Harris",
      "text": " Wednesday. "
    },
    {
      "date": "2025-05-19 19:34:00",
      "sender": "Devon Harris",
      "text": " Sorry I haven\u2019t pushed the utils directory fix. "
    },
    {
      "date": "2025-05-19 19:34:00",
      "sender": "Devon Harris",
      "text": " I haven\u2019t had time to sit down and code. "
    },
    {
      "date": "2025-05-19 23:08:00",
      "sender": "You",
      "text": " Kk, nw. Got some cool stuff to show you once you are. "
    }
  ]
};

const output8: ExampleOutput[] = [
  {
    "event_type": "not_an_event"
  }
];

// Example 9
const input9: ExampleInput = {
  "title": "Logan White, Dad, Reese Garcia, Job, Cameron Martinez, Finley Robinson",
  "participants": [
    "Reese Garcia",
    "Dad",
    "Cameron Martinez",
    "Skyler",
    "Finley Robinson",
    "Logan White"
  ],
  "structured_messages": [
    {
      "date": "2025-06-24 13:12:00",
      "sender": "You",
      "text": " You're all banned from re-entering america. Get owned. "
    },
    {
      "date": "2025-06-24 13:48:00",
      "sender": "Cameron Martinez",
      "text": " If he just had an uno reverse card to play on ice he would have been fine. . "
    },
    {
      "date": "2025-06-24 13:49:00",
      "sender": "You",
      "text": " yeah, thats why they screen for those now in the xrays. "
    },
    {
      "date": "2025-06-24 13:49:00",
      "sender": "You",
      "text": " also prevents playing draw two if they pull a gun on you. "
    },
    {
      "date": "2025-06-24 14:04:00",
      "sender": "Reese Garcia",
      "text": " I feel like if they have already drawn on me I don't want them drawing more guns, unless the idea is like it's one guy holding one gun and then I'm like draw two and now he has to hold 3 guns. That does seem less accurate . "
    },
    {
      "date": "2025-06-24 14:29:00",
      "sender": "You",
      "text": " nah, you get to draw two more and have their gun. "
    },
    {
      "date": "2025-06-24 14:37:00",
      "sender": "Cameron Martinez",
      "text": " Can we just turn them into gun-shaped blocks of cheese? I love cheese!. "
    },
    {
      "date": "2025-06-24 20:12:00",
      "sender": "You",
      "text": null
    },
    {
      "date": "2025-06-24 20:12:00",
      "sender": "You",
      "text": " You're all banned from re-entering america. Get owned. "
    },
    {
      "date": "2025-06-24 21:29:00",
      "sender": "You",
      "text": " nah, you get to draw two more and have their gun. "
    },
    {
      "date": "2025-06-24 21:37:00",
      "sender": "Cameron Martinez",
      "text": " Can we just turn them into gun-shaped blocks of cheese? I love cheese!. "
    },
    {
      "date": "2025-06-25 14:58:00",
      "sender": "Cameron Martinez",
      "text": " Are there games tonight? . "
    },
    {
      "date": "2025-06-25 16:06:00",
      "sender": "Reese Garcia",
      "text": " I am out. "
    },
    {
      "date": "2025-06-25 21:58:00",
      "sender": "Cameron Martinez",
      "text": " Are there games tonight? . "
    },
    {
      "date": "2025-06-28 10:29:00",
      "sender": "Reese Garcia",
      "text": " i dont know what this is, but i know it is a finley and cameron game https://store.steampowered.com/app/1205450/Turnip_Boy_Commits_Tax_Evasion/. "
    },
    {
      "date": "2025-06-28 16:43:00",
      "sender": "Skyler",
      "text": " turnip games?. "
    },
    {
      "date": "2025-06-28 16:43:00",
      "sender": "Cameron Martinez",
      "text": " In can game in 5. "
    },
    {
      "date": "2025-06-28 16:43:00",
      "sender": "Reese Garcia",
      "text": " I accept. "
    },
    {
      "date": "2025-06-28 16:47:00",
      "sender": "Skyler",
      "text": " luka cyring. "
    },
    {
      "date": "2025-06-28 16:47:00",
      "sender": "Skyler",
      "text": " need 10. "
    },
    {
      "date": "2025-06-28 16:53:00",
      "sender": "Dad",
      "text": null
    },
    {
      "date": "2025-06-28 16:54:00",
      "sender": "Cameron Martinez",
      "text": " Nice fire . "
    },
    {
      "date": "2025-06-28 16:56:00",
      "sender": "You",
      "text": " You look so creepy in that pic. "
    },
    {
      "date": "2025-06-29 10:09:00",
      "sender": "Reese Garcia",
      "text": " Dost we ditos. "
    },
    {
      "date": "2025-06-29 11:21:00",
      "sender": "Dad",
      "text": " Ok . "
    },
    {
      "date": "2025-06-29 14:48:00",
      "sender": "Cameron Martinez",
      "text": " I can I am off the boat now . "
    },
    {
      "date": "2025-06-30 17:58:00",
      "sender": "Cameron Martinez",
      "text": " Game? . "
    },
    {
      "date": "2025-06-30 18:09:00",
      "sender": "Reese Garcia",
      "text": " Haha just got off. "
    },
    {
      "date": "2025-07-01 13:36:00",
      "sender": "Cameron Martinez",
      "text": " I hear peak is a hoot . "
    },
    {
      "date": "2025-07-01 13:37:00",
      "sender": "Reese Garcia",
      "text": " Peak is great. "
    },
    {
      "date": "2025-07-01 13:38:00",
      "sender": "Logan White",
      "text": " Ooooo. "
    },
    {
      "date": "2025-07-01 13:39:00",
      "sender": "Logan White",
      "text": " Sounds pretty sweet . "
    },
    {
      "date": "2025-07-01 13:42:00",
      "sender": "You",
      "text": " Wut. "
    },
    {
      "date": "2025-07-01 13:43:00",
      "sender": "Skyler",
      "text": " david and i just started our inaugeral climb. "
    },
    {
      "date": "2025-07-01 17:37:00",
      "sender": "You",
      "text": " I could do one more game if we get a third. "
    },
    {
      "date": "2025-07-01 17:37:00",
      "sender": "Dad",
      "text": " Peak or dota?. "
    },
    {
      "date": "2025-07-01 17:38:00",
      "sender": "You",
      "text": " Dota. "
    },
    {
      "date": "2025-07-01 17:38:00",
      "sender": "You",
      "text": " I want to PVP Reese off a mountain in real life, not a videogame. "
    },
    {
      "date": "2025-07-01 17:39:00",
      "sender": "Logan White",
      "text": " Reese don\u2019t forget to throw casey into many cyclones! It\u2019s all part of the help him climb the mountain strat.. "
    },
    {
      "date": "2025-07-02 06:21:00",
      "sender": "Skyler",
      "text": " did yall make it to the top?. "
    },
    {
      "date": "2025-07-02 06:23:00",
      "sender": "Cameron Martinez",
      "text": " We went to the top of feed mountain . "
    },
    {
      "date": "2025-07-02 16:30:00",
      "sender": "Cameron Martinez",
      "text": " Climbing try 2 . "
    },
    {
      "date": "2025-07-02 16:44:00",
      "sender": "Reese Garcia",
      "text": " It is a four player game unfortunately, and I am already with 3 of my other friends. "
    },
    {
      "date": "2025-07-02 16:45:00",
      "sender": "Cameron Martinez",
      "text": " Copy . "
    },
    {
      "date": "2025-07-06 15:55:00",
      "sender": "Reese Garcia",
      "text": " Any gamers?. "
    },
    {
      "date": "2025-07-06 15:56:00",
      "sender": "Cameron Martinez",
      "text": " 1 quick . "
    },
    {
      "date": "2025-07-06 16:03:00",
      "sender": "You",
      "text": " Not metos. "
    },
    {
      "date": "2025-07-06 16:47:00",
      "sender": "Reese Garcia",
      "text": " We don't need you anymore casey, we can just ask ai anything we would talk to you about. "
    },
    {
      "date": "2025-07-06 17:20:00",
      "sender": "Skyler",
      "text": " Need 1.5 hrs. "
    },
    {
      "date": "2025-07-06 18:25:00",
      "sender": "Skyler",
      "text": " I'm ready for Dad games. "
    },
    {
      "date": "2025-07-06 18:26:00",
      "sender": "Reese Garcia",
      "text": " We climbing or doting?. "
    },
    {
      "date": "2025-07-06 18:28:00",
      "sender": "You",
      "text": " I can in 10. "
    },
    {
      "date": "2025-07-06 18:28:00",
      "sender": "You",
      "text": " actaully, nvm. I cannot. "
    },
    {
      "date": "2025-07-06 18:29:00",
      "sender": "Skyler",
      "text": " Let's dote. "
    },
    {
      "date": "2025-07-06 19:43:00",
      "sender": "Finley Robinson",
      "text": " Let\u2019s boat . "
    },
    {
      "date": "2025-07-06 19:53:00",
      "sender": "Cameron Martinez",
      "text": null
    },
    {
      "date": "2025-07-06 22:10:00",
      "sender": "Cameron Martinez",
      "text": " Post boat game? . "
    },
    {
      "date": "2025-07-08 00:03:00",
      "sender": "Cameron Martinez",
      "text": " Any games? . "
    },
    {
      "date": "2025-07-08 00:36:00",
      "sender": "Reese Garcia",
      "text": " About to jump on PEAK with some friends. I think we will have an extra slot if you want to jump on. "
    },
    {
      "date": "2025-07-08 00:36:00",
      "sender": "Cameron Martinez",
      "text": " I will give it a run . "
    },
    {
      "date": "2025-07-08 00:56:00",
      "sender": "Reese Garcia",
      "text": " Peak hates me. "
    },
    {
      "date": "2025-07-08 00:56:00",
      "sender": "Cameron Martinez",
      "text": " Lol . "
    },
    {
      "date": "2025-07-08 00:58:00",
      "sender": "You",
      "text": null
    },
    {
      "date": "2025-07-08 01:45:00",
      "sender": "Skyler",
      "text": " Silly devs used photon instead of fishnet!!. "
    },
    {
      "date": "2025-07-08 22:24:00",
      "sender": "Cameron Martinez",
      "text": " https://analyticsindiamag.com/ai-features/every-single-ai-researcher-making-10-100-million-is-a-dota-2-player/. "
    },
    {
      "date": "2025-07-08 22:29:00",
      "sender": "Cameron Martinez",
      "text": " Any games tonight? . "
    },
    {
      "date": "2025-07-08 22:35:00",
      "sender": "You",
      "text": " I can a few. "
    },
    {
      "date": "2025-07-08 22:36:00",
      "sender": "Skyler",
      "text": " My hall pass starts at 715 Texas time. "
    },
    {
      "date": "2025-07-08 22:47:00",
      "sender": "You",
      "text": " Are we awaiting a jobbo?. "
    },
    {
      "date": "2025-07-08 22:48:00",
      "sender": "Cameron Martinez",
      "text": " I can play now, now and later or just later. . "
    },
    {
      "date": "2025-07-08 22:49:00",
      "sender": "Cameron Martinez",
      "text": " I think we should wait on a 3 stack . "
    },
    {
      "date": "2025-07-08 23:03:00",
      "sender": "Logan White",
      "text": " I feel so targeted . "
    },
    {
      "date": "2025-07-08 23:04:00",
      "sender": "Cameron Martinez",
      "text": " \ud83e\udd23. "
    },
    {
      "date": "2025-07-08 23:58:00",
      "sender": "Skyler",
      "text": " I'm ready. "
    },
    {
      "date": "2025-07-08 23:58:00",
      "sender": "Reese Garcia",
      "text": " Let's do this. "
    },
    {
      "date": "2025-07-09 00:05:00",
      "sender": "Reese Garcia",
      "text": " We're getting jooled. "
    },
    {
      "date": "2025-07-09 00:05:00",
      "sender": "Skyler",
      "text": " seems like a lie. "
    },
    {
      "date": "2025-07-09 21:43:00",
      "sender": "Reese Garcia",
      "text": " Quick dotes?. "
    },
    {
      "date": "2025-07-11 09:22:00",
      "sender": "Cameron Martinez",
      "text": " Heroes of Might & Magic: Olden Era... Is this just might and magic 3 remastered \n . "
    },
    {
      "date": "2025-07-11 09:28:00",
      "sender": "You",
      "text": " Hmm. Looks like a fully new entry. I like that it is harkening back to the old visual styles though. "
    },
    {
      "date": "2025-07-11 09:29:00",
      "sender": "You",
      "text": " I'd be down to play on release. "
    },
    {
      "date": "2025-07-11 09:29:00",
      "sender": "Skyler",
      "text": " I know a certain beantsprout with 1000's of HOMM3 hours. "
    },
    {
      "date": "2025-07-11 09:30:00",
      "sender": "Cameron Martinez",
      "text": " Logan and I played a lot of homm3 before we played Dota . "
    },
    {
      "date": "2025-07-11 09:30:00",
      "sender": "You",
      "text": " No. Beant cursed us and we lost valheim. "
    },
    {
      "date": "2025-07-11 09:31:00",
      "sender": "Skyler",
      "text": " haha not the giant apocalyptic skeleton burning down the world?. "
    },
    {
      "date": "2025-07-11 09:31:00",
      "sender": "You",
      "text": " Yes to Logan. Extra yes if he invites me over to lan with him . "
    },
    {
      "date": "2025-07-11 09:31:00",
      "sender": "Logan White",
      "text": " Oooo! I may get in less trouble if I come to you though.. "
    },
    {
      "date": "2025-07-11 09:32:00",
      "sender": "Cameron Martinez",
      "text": " Everybody on the same PC . "
    },
    {
      "date": "2025-07-11 09:32:00",
      "sender": "You",
      "text": " Works for me. If Cameron ever came out to see his niece we could have a real threesome. "
    },
    {
      "date": "2025-07-11 09:32:00",
      "sender": "Cameron Martinez",
      "text": " Don't tease me with a good time. . "
    },
    {
      "date": "2025-07-11 09:33:00",
      "sender": "Skyler",
      "text": " Threesome in the hotseat. "
    },
    {
      "date": "2025-07-11 09:36:00",
      "sender": "Skyler",
      "text": " looks like the devil faciton dropped?. "
    },
    {
      "date": "2025-07-11 09:37:00",
      "sender": "Logan White",
      "text": " There is always someone that takes too long during their turn\u2026. Cough cough\u2026. Just build devils, auto fight and move on!. "
    },
    {
      "date": "2025-07-11 09:37:00",
      "sender": "Cameron Martinez",
      "text": " That was a great faction . "
    },
    {
      "date": "2025-07-11 09:38:00",
      "sender": "Reese Garcia",
      "text": " It's all about the mage faction . "
    },
    {
      "date": "2025-07-11 09:38:00",
      "sender": "Reese Garcia",
      "text": " Or elves. "
    },
    {
      "date": "2025-07-11 09:38:00",
      "sender": "Reese Garcia",
      "text": " Also casey I could go visit you. "
    },
    {
      "date": "2025-07-11 09:38:00",
      "sender": "Cameron Martinez",
      "text": " Arch devil and pit lords . "
    },
    {
      "date": "2025-07-11 09:39:00",
      "sender": "Cameron Martinez",
      "text": " I liked the wood faction . "
    }
  ]
};

const output9: ExampleOutput[] = [
  {
    "event_type": "not_an_event"
  }
];

// Example 10
const input10: ExampleInput = {
  "title": "Dad, Reese Garcia, Harper Garcia, Mom",
  "participants": [
    "Mom",
    "Harper Garcia",
    "Reese Garcia",
    "Dad"
  ],
  "structured_messages": [
    {
      "date": "2024-06-06 06:17:00",
      "sender": "Reese Garcia",
      "text": " Shouldn't you be on your flight. "
    },
    {
      "date": "2024-06-06 06:17:00",
      "sender": "Reese Garcia",
      "text": " Did you pay for inflight texting. "
    },
    {
      "date": "2024-06-06 06:17:00",
      "sender": "Reese Garcia",
      "text": " Cause you can what's app for free on some united flights. "
    },
    {
      "date": "2025-05-31 15:03:00",
      "sender": "Reese Garcia",
      "text": " When is jeans actual birthday . "
    },
    {
      "date": "2025-05-31 15:43:00",
      "sender": "Mom",
      "text": " Yesterday.\nJust boarded our flt to Charlotte SC then on to Austin.. "
    },
    {
      "date": "2025-05-31 15:44:00",
      "sender": "Reese Garcia",
      "text": " Oh I would have wished her happy birthday on her birthday yesterday when I called y'all while y'all were in the car together . "
    },
    {
      "date": "2025-05-31 15:45:00",
      "sender": "Mom",
      "text": " Oops!\nTo late.\nTell everyone at Ella\u2019s graduation we\u2019re sorry to miss!. "
    }
  ]
};

const output10: ExampleOutput[] = [
  {
    "event_type": "not_an_event"
  }
];

// Example 12
const input12: ExampleInput = {
  "title": "Sage Williams, Uncle Mike",
  "participants": [
    "Sage Williams",
    "Uncle Mike"
  ],
  "structured_messages": [
    {
      "text": " Y'all will be gone from July 31st through August 9th. I will be watching little it during that time. ",
      "date": "2025-07-10 20:43:00",
      "sender": "You"
    },
    {
      "text": " Yea!   Thank you so much!!!!. ",
      "date": "2025-07-10 20:47:00",
      "sender": "Sage Williams"
    }
  ]
};

const output12: ExampleOutput[] = [
  {
    "event_type": "full_potential_event_details",
    "summary": "Sage and Mike gone, Reese watching little it",
    "description": "Sage and Mike gone, Reese watching little it",
    "location": "Unknown",
    "start": {
      "date": "2025-07-31"
    },
    "end": {
      "date": "2025-08-09"
    },
    "attendees": "Reese Garcia",
    "user_confirmed_attendance": true,
    "reference_messages": [
      {
        "text": " Y'all will be gone from July 31st through August 9th. I will be watching little it during that time. ",
        "date": "2025-07-10 20:43:00",
        "sender": "You"
      },
      {
        "text": " Yea!   Thank you so much!!!!. ",
        "date": "2025-07-10 20:47:00",
        "sender": "Sage Williams"
      }
    ]
  }
];

// Example 15
const input15: ExampleInput = {
  "title": "Jesse Clark",
  "participants": [
    "Jesse Clark"
  ],
  "structured_messages": [
    {
      "date": "10/03/25, 05:34:14PM",
      "sender": "casey",
      "sender_nickname": "2",
      "text": "Want to grab lunch/dinner sometime this weekend? Could bring in some delivery. "
    },
    {
      "date": "10/06/25, 02:23:23AM",
      "sender": "Jesse Clark",
      "sender_nickname": "1.121",
      "text": "yooo dude! Yes I want to see you guys, it's been too long"
    },
    {
      "date": "10/06/25, 02:23:35AM",
      "sender": "Jesse Clark",
      "sender_nickname": "1.121",
      "text": "we were actually just about to book travel for your wedding, excited to celebrate you!"
    },
    {
      "date": "10/06/25, 02:23:51AM",
      "sender": "Jesse Clark",
      "sender_nickname": "1.121",
      "text": "Sorry for the radio silence. Things are quite a bit harder with the baby, we are a bunch less mobile"
    },
    {
      "date": "10/06/25, 02:24:06AM",
      "sender": "Jesse Clark",
      "sender_nickname": "1.121",
      "text": "We're about to be out of town for 2 weeks but then back at it. Circle back then?"
    },
    {
      "date": "10/06/25, 02:24:18AM",
      "sender": "Jesse Clark",
      "sender_nickname": "1.121",
      "text": "Hows the wedding planning going? less than 4 months away!"
    },
    {
      "date": "10/06/25, 02:46:13AM",
      "sender": "Jesse Clark",
      "sender_nickname": "1.121",
      "text": "also are there more wedding events than the ceremony and the boat thing on Sun? Also when does the boat thing end? We're looking to book flights"
    },
    {
      "date": "10/06/25, 04:14:17AM",
      "sender": "casey",
      "sender_nickname": "2",
      "text": "No worries"
    },
    {
      "date": "10/06/25, 04:15:15AM",
      "sender": "casey",
      "sender_nickname": "2",
      "text": "Wedding events are just ceremony and boats. We will be around grabbing drinks night before ceremony. Boat will be done ~3 but will take some time to get from there to airport"
    },
    {
      "date": "10/06/25, 05:30:42PM",
      "sender": "Jesse Clark",
      "sender_nickname": "1.121",
      "text": "got it, thanks! We're booking hte travel today"
    },
    {
      "date": "10/06/25, 05:51:30PM",
      "sender": "casey",
      "sender_nickname": "2",
      "text": "sweet! I'll check back in a few weeks to hang as well"
    },
    {
      "date": "10/06/25, 06:11:27PM",
      "sender": "Jesse Clark",
      "sender_nickname": "1.121",
      "text": "yes! And sorry for the flakiness"
    },
    {
      "date": "10/06/25, 06:12:07PM",
      "sender": "casey",
      "sender_nickname": "2",
      "text": "You have a baby, not an issue"
    }
  ],
  "user_name_in_conversation": "casey"
};

const output15: ExampleOutput[] = [
  {
    "event_type": "incomplete_event_details",
    "summary": "Lunch/Dinner with Jesse Clark Date TBD",
    "description": "Catch-up lunch or dinner with Jesse Clark. To be planned once Jesse returns from his trip.",
    "attendees": "Jesse Clark",
    "user_confirmed_attendance": true,
    "start": {
      "date": "2025-10-20"
    },
    "reference_messages": [
      {
        "date": "2025-10-03 17:34:14",
        "sender": "casey",
        "sender_nickname": "2",
        "text": "Want to grab lunch/dinner sometime this weekend? Could bring in some delivery. "
      },
      {
        "date": "2025-10-06 02:23:23",
        "sender": "Jesse Clark",
        "sender_nickname": "1.121",
        "text": "yooo dude! Yes I want to see you guys, it's been too long"
      },
      {
        "date": "2025-10-06 02:24:06",
        "sender": "Jesse Clark",
        "sender_nickname": "1.121",
        "text": "We're about to be out of town for 2 weeks but then back at it. Circle back then?"
      },
      {
        "date": "2025-10-06 17:51:30",
        "sender": "casey",
        "sender_nickname": "2",
        "text": "sweet! I'll check back in a few weeks to hang as well"
      }
    ]
  }
];

// Example 16
const input16: ExampleInput = {
  "title": "Bug, Dad, Reese Garcia, Harper Garcia, Dana Lee - #1 Wife, Mom, Parker Lewis",
  "participants": [
    "Bug",
    "Mom",
    "Reese Garcia",
    "Dad",
    "Harper Garcia",
    "Dana Lee - #1 Wife",
    "Parker Lewis"
  ],
  "structured_messages": [
    {
      "date": "10/13/25, 04:42:06PM",
      "sender": "Mom",
      "sender_nickname": "1.5",
      "text": "From Brooke and Ryan:\n\nHello! We are just 17 short days away from the BIG day, and we wanted to give you all an update on a few details.\u00a0\n\nThe rehearsal will begin in the chapel at 10:30am, and we asked our wedding party to arrive at 10:00am. There will be light breakfast bites available prior to the rehearsal and grab-and-go lunch after the rehearsal around 11:30am. You are free to go after the rehearsal! Our photographer will begin taking a few group\u00a0photos prior to the ceremony starting at 2:30pm (groom + parents, bride + parents, groom + groomsmen/ring bearer, bride + bridesmaids/flower girls). Bob and Ann, you are welcome to arrive closer to 3:15-30PM. The DJ will be there at that time if you all would like to test microphones, etc.\u00a0The ceremony begins at 4:00PM. \n\nPlease let us know if you have any questions. We are so excited to celebrate with you all and\u00a0thankful to have each of you be a part of our special day!"
    },
    {
      "date": "10/13/25, 04:45:52PM",
      "sender": "Mom",
      "sender_nickname": "1.5",
      "text": "Dana, Harper, a Paige and I will be leaving Downtown Suites at 12:30 to go get our hair done, leaving Mia in the most  capable hands of her uncles with dad who will be working for solamente emergencies!\ud83d\ude33\nThank you for understanding and taking on this gran responsibility!"
    }
  ],
  "user_name_in_conversation": "casey"
};

const output16: ExampleOutput[] = [
  {
    "event_type": "full_potential_event_details",
    "summary": "Wedding rehearsal",
    "description": "The rehearsal will begin in the chapel at 10:30am, and we asked our wedding party to arrive at 10:00am. There will be light breakfast bites available prior to the rehearsal and grab-and-go lunch after",
    "start": {
      "dateTime": "2025-10-25T10:00:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "end": {
      "dateTime": "2025-10-25T11:30:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "reference_messages": [
      {
        "date": "10/13/25, 04:42:06PM",
        "sender": "Mom",
        "sender_nickname": "1.5",
        "text": "From Brooke and Ryan:\n\nHello! We are just 17 short days away from the BIG day, and we wanted to give you all an update on a few details.\u00a0\n\nThe rehearsal will begin in the chapel at 10:30am, and we asked our wedding party to arrive at 10:00am. There will be light breakfast bites available prior to the rehearsal and grab-and-go lunch after the rehearsal around 11:30am. You are free to go after the rehearsal! Our photographer will begin taking a few group\u00a0photos prior to the ceremony starting at 2:30pm (groom + parents, bride + parents, groom + groomsmen/ring bearer, bride + bridesmaids/flower girls). Bob and Ann, you are welcome to arrive closer to 3:15-30PM. The DJ will be there at that time if you all would like to test microphones, etc.\u00a0The ceremony begins at 4:00PM. \n\nPlease let us know if you have any questions. We are so excited to celebrate with you all and\u00a0thankful to have each of you be a part of our special day!"
      }
    ]
  },
  {
    "event_type": "full_potential_event_details",
    "summary": "Group photos (end time to be confirmed)",
    "description": "The photographer will begin taking a few group photos prior to the ceremony starting at 2:30pm (groom + parents, bride + parents, groom + groomsmen/ring bearer, bride + bridesmaids/flower girls). Bob and Ann, you are welcome to arrive closer to 3:15-30PM. The DJ will be there at that time if you all would like to test microphones, etc.",
    "start": {
      "dateTime": "2025-10-25T14:30:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "end": {
      "dateTime": "2025-10-25T15:30:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "reference_messages": [
      {
        "date": "10/13/25, 04:42:06PM",
        "sender": "Mom",
        "sender_nickname": "1.5",
        "text": "From Brooke and Ryan:\n\nHello! We are just 17 short days away from the BIG day, and we wanted to give you all an update on a few details.\u00a0\n\nThe rehearsal will begin in the chapel at 10:30am, and we asked our wedding party to arrive at 10:00am. There will be light breakfast bites available prior to the rehearsal and grab-and-go lunch after the rehearsal around 11:30am. You are free to go after the rehearsal! Our photographer will begin taking a few group\u00a0photos prior to the ceremony starting at 2:30pm (groom + parents, bride + parents, groom + groomsmen/ring bearer, bride + bridesmaids/flower girls). Bob and Ann, you are welcome to arrive closer to 3:15-30PM. The DJ will be there at that time if you all would like to test microphones, etc.\u00a0The ceremony begins at 4:00PM. \n\nPlease let us know if you have any questions. We are so excited to celebrate with you all and\u00a0thankful to have each of you be a part of our special day!"
      }
    ]
  },
  {
    "event_type": "full_potential_event_details",
    "summary": "Wedding ceremony (end time to be confirmed)",
    "description": "The ceremony begins at 4:00PM. Please let us know if you have any questions. We are so excited to celebrate with you all and thankful to have each of you be a part of our special day!",
    "start": {
      "dateTime": "2025-10-25T16:00:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "end": {
      "dateTime": "2025-10-25T17:00:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "reference_messages": [
      {
        "date": "10/13/25, 04:42:06PM",
        "sender": "Mom",
        "sender_nickname": "1.5",
        "text": "From Brooke and Ryan:\n\nHello! We are just 17 short days away from the BIG day, and we wanted to give you all an update on a few details.\u00a0\n\nThe rehearsal will begin in the chapel at 10:30am, and we asked our wedding party to arrive at 10:00am. There will be light breakfast bites available prior to the rehearsal and grab-and-go lunch after the rehearsal around 11:30am. You are free to go after the rehearsal! Our photographer will begin taking a few group\u00a0photos prior to the ceremony starting at 2:30pm (groom + parents, bride + parents, groom + groomsmen/ring bearer, bride + bridesmaids/flower girls). Bob and Ann, you are welcome to arrive closer to 3:15-30PM. The DJ will be there at that time if you all would like to test microphones, etc.\u00a0The ceremony begins at 4:00PM. \n\nPlease let us know if you have any questions. We are so excited to celebrate with you all and\u00a0thankful to have each of you be a part of our special day!"
      }
    ]
  },
  {
    "event_type": "full_potential_event_details",
    "summary": "Getting hair done (end time to be confirmed)",
    "description": "Dana, Harper, a Paige and I will be leaving Downtown Suites at 12:30 to go get our hair done, leaving Mia in the most  capable hands of her uncles with dad who will be working for solamente emergencies!\ud83d\ude33",
    "start": {
      "dateTime": "2025-10-25T12:30:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "end": {
      "dateTime": "2025-10-25T13:30:00-07:00",
      "timeZone": "America/Los_Angeles"
    },
    "attendees": "Dana, Harper, Paige, Mom",
    "reference_messages": [
      {
        "date": "10/13/25, 04:45:52PM",
        "sender": "Mom",
        "sender_nickname": "1.5",
        "text": "Dana, Harper, a Paige and I will be leaving Downtown Suites at 12:30 to go get our hair done, leaving Mia in the most  capable hands of her uncles with dad who will be working for solamente emergencies!\ud83d\ude33\nThank you for understanding and taking on this gran responsibility!"
      }
    ]
  }
];


/**
 * All examples as [input, output] pairs
 * These are the examples used in get_text_event_extraction_instructions
 */
export const EXTRACTION_EXAMPLES: [ExampleInput, ExampleOutput[]][] = [
  [input1, output1],
  [input2, output2],
  [input6, output6],
  [input7, output7],
  [input8, output8],
  [input9, output9],
  [input10, output10],
  [input12, output12],
  [input15, output15],
  [input16, output16]
];

/**
 * Format examples into a string for the prompt
 */
export function getExamplesString(): string {
  if (EXTRACTION_EXAMPLES.length === 0) {
    return '';
  }
  
  let result = '***** EXAMPLES *****\n';
  result += 'Below are some examples of text inputs and the correct outputs.\n\n';
  
  EXTRACTION_EXAMPLES.forEach(([input, output], idx) => {
    result += `***** EXAMPLE INPUT ${idx + 1} *****\n`;
    result += '***** TEXT MESSAGE INPUT *****\n';
    result += JSON.stringify(input, null, 2) + '\n';
    result += `***** EXAMPLE OUTPUT ${idx + 1} *****\n`;
    result += JSON.stringify(output, null, 2) + '\n\n';
  });
  
  return result;
}

// Export individual examples for direct access
export {
  input1,
  output1,
  input2,
  output2,
  input6,
  output6,
  input7,
  output7,
  input8,
  output8,
  input9,
  output9,
  input10,
  output10,
  input12,
  output12,
  input15,
  output15,
  input16,
  output16,
};
