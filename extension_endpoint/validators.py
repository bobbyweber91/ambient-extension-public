"""
Validators for extension endpoint API inputs.
Validates conversation and event objects from the Chrome extension.
"""
from typing import Tuple, Optional


class ValidationError(Exception):
    """Raised when validation fails."""
    pass


def validate_conversation(data: dict) -> Tuple[bool, Optional[str]]:
    """
    Validate a conversation object from the extension.
    
    Expected format:
    {
        "title": str,
        "structured_messages": [
            {
                "date": str,  # ISO 8601 or "MM/DD/YY, HH:MM:SSAM/PM"
                "sender": str,
                "text": str
            },
            ...
        ],
        "participants": [str, ...] (optional)
    }
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not isinstance(data, dict):
        return False, "Conversation must be a JSON object"
    
    # Check required fields
    if 'title' not in data:
        return False, "Missing required field: title"
    
    if not isinstance(data.get('title'), str):
        return False, "Field 'title' must be a string"
    
    if 'structured_messages' not in data:
        return False, "Missing required field: structured_messages"
    
    if not isinstance(data.get('structured_messages'), list):
        return False, "Field 'structured_messages' must be an array"
    
    # Validate each message
    for idx, message in enumerate(data['structured_messages']):
        if not isinstance(message, dict):
            return False, f"Message at index {idx} must be an object"
        
        # Check required message fields
        if 'date' not in message:
            return False, f"Message at index {idx} missing required field: date"
        if 'sender' not in message:
            return False, f"Message at index {idx} missing required field: sender"
        if 'text' not in message:
            return False, f"Message at index {idx} missing required field: text"
        
        # Validate types
        if not isinstance(message.get('date'), str):
            return False, f"Message at index {idx}: 'date' must be a string"
        if not isinstance(message.get('sender'), str):
            return False, f"Message at index {idx}: 'sender' must be a string"
        if not isinstance(message.get('text'), str):
            return False, f"Message at index {idx}: 'text' must be a string"
    
    # Optional participants validation
    if 'participants' in data:
        if not isinstance(data['participants'], list):
            return False, "Field 'participants' must be an array"
        for idx, participant in enumerate(data['participants']):
            if not isinstance(participant, str):
                return False, f"Participant at index {idx} must be a string"
    
    return True, None


def validate_extracted_event(data: dict) -> Tuple[bool, Optional[str]]:
    """
    Validate an extracted event object from the extension.
    
    Expected format:
    {
        "event_type": str,  # Required
        "summary": str,     # Required for matching
        "description": str, # Optional
        "location": str,    # Optional
        "start": {          # Optional
            "date": str,
            "dateTime": str,
            "timeZone": str
        },
        "end": {...},       # Optional
        "attendees": str,   # Optional
        "htmlLink": str,    # Optional
        "user_confirmed_attendance": bool,  # Optional
        "reference_messages": [...]  # Optional
    }
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not isinstance(data, dict):
        return False, "Event must be a JSON object"
    
    # Check required fields
    if 'event_type' not in data:
        return False, "Missing required field: event_type"
    
    valid_event_types = [
        'full_potential_event_details',
        'incomplete_event_details',
        'not_a_desired_event',
        'not_an_event'
    ]
    
    if data.get('event_type') not in valid_event_types:
        return False, f"Invalid event_type. Must be one of: {', '.join(valid_event_types)}"
    
    # For matching, we need at least a summary
    if 'summary' not in data:
        return False, "Missing required field: summary"
    
    # Validate date/time structure if present
    for field in ['start', 'end']:
        if field in data and data[field] is not None:
            if not isinstance(data[field], dict):
                return False, f"Field '{field}' must be an object"
    
    return True, None


def validate_calendar_event(data: dict) -> Tuple[bool, Optional[str]]:
    """
    Validate a calendar event object from the extension.
    
    Expected format:
    {
        "id": str,          # Optional but recommended
        "summary": str,     # Optional
        "description": str, # Optional
        "location": str,    # Optional
        "start": {          # Optional
            "date": str,
            "dateTime": str,
            "timeZone": str
        },
        "end": {...},       # Optional
        "htmlLink": str,    # Optional
        "attendees": [...], # Optional
        "calendarName": str # Optional
    }
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not isinstance(data, dict):
        return False, "Calendar event must be a JSON object"
    
    # Calendar events can be quite sparse, just validate structure
    # Validate date/time structure if present
    for field in ['start', 'end']:
        if field in data and data[field] is not None:
            if not isinstance(data[field], dict):
                return False, f"Field '{field}' must be an object"
    
    return True, None


def validate_match_request(data: dict) -> Tuple[bool, Optional[str]]:
    """
    Validate the full match request containing event and calendar_events.
    
    Expected format:
    {
        "event": {...},           # ExtractedEvent object
        "calendar_events": [...]  # Array of CalendarEvent objects
    }
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not isinstance(data, dict):
        return False, "Request must be a JSON object"
    
    # Check required fields
    if 'event' not in data:
        return False, "Missing required field: event"
    
    if 'calendar_events' not in data:
        return False, "Missing required field: calendar_events"
    
    if not isinstance(data.get('calendar_events'), list):
        return False, "Field 'calendar_events' must be an array"
    
    # Validate the event
    is_valid, error = validate_extracted_event(data['event'])
    if not is_valid:
        return False, f"Invalid event: {error}"
    
    # Validate each calendar event
    for idx, cal_event in enumerate(data['calendar_events']):
        is_valid, error = validate_calendar_event(cal_event)
        if not is_valid:
            return False, f"Invalid calendar_event at index {idx}: {error}"
    
    return True, None


def validate_extract_request(data: dict) -> Tuple[bool, Optional[str]]:
    """
    Validate the full extract request containing conversation and user_name.
    
    Expected format:
    {
        "conversation": {...},  # Conversation object
        "user_name": str        # User's name for prompt context
    }
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not isinstance(data, dict):
        return False, "Request must be a JSON object"
    
    # Check required fields
    if 'conversation' not in data:
        return False, "Missing required field: conversation"
    
    if 'user_name' not in data:
        return False, "Missing required field: user_name"
    
    if not isinstance(data.get('user_name'), str):
        return False, "Field 'user_name' must be a string"
    
    if not data.get('user_name').strip():
        return False, "Field 'user_name' cannot be empty"
    
    # Validate the conversation
    is_valid, error = validate_conversation(data['conversation'])
    if not is_valid:
        return False, f"Invalid conversation: {error}"
    
    return True, None


MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB

def validate_file_extract_request(data: dict) -> Tuple[bool, Optional[str]]:
    """
    Validate a file extraction request.
    
    Expected format:
    {
        "file_data": str,    # Base64-encoded file content
        "mime_type": str,    # MIME type of the file
        "file_name": str     # Original file name (optional, for logging)
    }
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not isinstance(data, dict):
        return False, "Request must be a JSON object"

    if 'file_data' not in data:
        return False, "Missing required field: file_data"

    if not isinstance(data.get('file_data'), str):
        return False, "Field 'file_data' must be a base64-encoded string"

    if not data.get('file_data').strip():
        return False, "Field 'file_data' cannot be empty"

    # Rough size check on the base64 string (base64 is ~4/3 of original)
    estimated_size = len(data['file_data']) * 3 // 4
    if estimated_size > MAX_FILE_SIZE_BYTES:
        return False, f"File too large. Maximum size is {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB"

    if 'mime_type' not in data:
        return False, "Missing required field: mime_type"

    if not isinstance(data.get('mime_type'), str):
        return False, "Field 'mime_type' must be a string"

    if not data.get('mime_type').strip():
        return False, "Field 'mime_type' cannot be empty"

    return True, None
