"""
API endpoints for Chrome extension.
Provides event extraction and calendar matching via AmbientAI's paid Gemini tier.
"""
import json
import time
import base64
from functools import wraps
import requests
from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.core.cache import cache
from google import genai
from google.genai import types

from .validators import validate_extract_request, validate_match_request, validate_file_extract_request
from autoscheduler.core.text_extraction.text_extraction_examples import (
    format_conversation_for_event_extraction,
    get_text_event_extraction_instructions
)
from autoscheduler.core.matches.v2_event_match_instructions_and_examples import (
    generate_event_match_instructions
)
from json_utils import sanitize_and_parse_json
from genai_utils import response_text

# Model to use for API calls
DEFAULT_MODEL = "gemini-2.5-flash"

# CORS origin allowlist + helpers live in extension.cors_helpers so the trips app can reuse
# them (the trip edit endpoints are also called from the extension during re-import).
from extension.cors_helpers import ALLOWED_ORIGINS, cors_exempt as _shared_cors_exempt

# Google OAuth client IDs for the Ambient extension
# This is used to verify that tokens were issued for our extension
# We accept both old and new client IDs during transition
GOOGLE_CLIENT_IDS = [
    '636710672879-biss5lra11l6ho1624m4b9kujmo2u3vb.apps.googleusercontent.com',  # New public extension
    '636710672879-jtimq18mggv3ev79itq5uq0f1tpdmf5d.apps.googleusercontent.com',  # Legacy extension
]

# Rate limiting configuration
RATE_LIMIT_REQUESTS_DEFAULT = 5   # Max requests per window for users without Ambient profile
RATE_LIMIT_REQUESTS_AMBIENT = 10  # Max requests per window for users with Ambient profile
RATE_LIMIT_WINDOW = 86400         # Window size in seconds (24 hours / 1 day)


def verify_google_token(token: str) -> dict | None:
    """
    Verify a Google OAuth token and return user info.
    
    Makes two API calls:
    1. userinfo - to get the user's stable ID (sub claim)
    2. tokeninfo - to verify the token was issued for our client_id
    
    Returns:
        {'sub': '110248495921238986420', ...} on success
        None on failure
    """
    try:
        # Get user info (includes 'sub' - the stable user ID)
        userinfo_response = requests.get(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            headers={'Authorization': f'Bearer {token}'},
            timeout=5
        )
        
        if userinfo_response.status_code != 200:
            return None
        
        userinfo = userinfo_response.json()
        
        if 'sub' not in userinfo:
            return None
        
        # Verify the token was issued for OUR extension's client_id
        # This prevents someone from using a token from a different app
        tokeninfo_response = requests.get(
            f'https://oauth2.googleapis.com/tokeninfo?access_token={token}',
            timeout=5
        )
        
        if tokeninfo_response.status_code != 200:
            return None
        
        tokeninfo = tokeninfo_response.json()
        
        if tokeninfo.get('aud') not in GOOGLE_CLIENT_IDS:
            return None
        
        return userinfo
        
    except requests.Timeout:
        return None
    except Exception:
        return None


def check_ambient_profile(email: str) -> bool:
    """
    Check if a user has an Ambient profile by matching their Google email.
    
    Args:
        email: The user's email from Google OAuth
        
    Returns:
        True if a CustomUser with matching email exists, False otherwise
    """
    if not email:
        return False
    
    try:
        from users.models import CustomUser
        # Case-insensitive email lookup
        return CustomUser.objects.filter(email__iexact=email).exists()
    except Exception:
        return False


def check_rate_limit(user_id: str, is_ambient_user: bool = False) -> tuple[bool, int, int]:
    """
    Check if a user is within their rate limit.
    
    Args:
        user_id: Google user ID (sub claim)
        is_ambient_user: Whether user has an Ambient profile (gets higher limit)
        
    Returns:
        (allowed: bool, remaining: int, limit: int)
    """
    cache_key = f"ratelimit:extension:{user_id}"
    
    # Determine limit based on profile status
    limit = RATE_LIMIT_REQUESTS_AMBIENT if is_ambient_user else RATE_LIMIT_REQUESTS_DEFAULT
    
    current_count = cache.get(cache_key, 0)
    remaining = limit - current_count
    
    if current_count >= limit:
        return False, 0, limit
    
    # Increment counter (set TTL on first request)
    new_count = current_count + 1
    cache.set(cache_key, new_count, timeout=RATE_LIMIT_WINDOW)
    
    return True, remaining - 1, limit


def require_google_auth(view_func):
    """
    Decorator that requires and verifies a Google OAuth token.
    
    Extracts token from Authorization header, verifies with Google,
    checks rate limit, and attaches user_id to request.
    
    On success: request.google_user_id and request.is_ambient_user are set
    On failure: Returns 401 or 429 JsonResponse
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        # Skip auth for OPTIONS (CORS preflight)
        if request.method == 'OPTIONS':
            return view_func(request, *args, **kwargs)
        
        # Extract token from Authorization header
        auth_header = request.headers.get('Authorization', '')
        
        if not auth_header.startswith('Bearer '):
            return JsonResponse({
                'success': False,
                'error': 'Missing or invalid Authorization header',
                'events': None,
                'match_result': None,
            }, status=401)
        
        token = auth_header[7:]  # Remove 'Bearer ' prefix
        
        if not token or len(token) < 20:
            return JsonResponse({
                'success': False,
                'error': 'Invalid token format',
                'events': None,
                'match_result': None,
            }, status=401)
        
        # Verify token with Google
        userinfo = verify_google_token(token)
        
        if not userinfo:
            return JsonResponse({
                'success': False,
                'error': 'Invalid or expired Google token. Please reconnect your calendar.',
                'events': None,
                'match_result': None,
            }, status=401)
        
        user_id = userinfo['sub']
        user_email = userinfo.get('email', '')
        
        # Check if user has an Ambient profile (matching email)
        is_ambient_user = check_ambient_profile(user_email)
        
        # Check rate limit (uses higher limit for Ambient users)
        allowed, remaining, limit = check_rate_limit(user_id, is_ambient_user)
        
        if not allowed:
            response = JsonResponse({
                'success': False,
                'error': 'Rate limit exceeded. Please try again later.',
                'events': None,
                'match_result': None,
                'is_ambient_user': is_ambient_user,
            }, status=429)
            response['X-RateLimit-Remaining'] = '0'
            response['X-RateLimit-Reset'] = str(RATE_LIMIT_WINDOW)
            response['X-RateLimit-Limit'] = str(limit)
            response['X-Ambient-User'] = 'true' if is_ambient_user else 'false'
            return response
        
        # Attach user info to request for use in view
        request.google_user_id = user_id
        request.google_user_email = user_email
        request.is_ambient_user = is_ambient_user
        
        # Call the actual view
        response = view_func(request, *args, **kwargs)
        
        # Add rate limit and ambient user headers to successful responses
        response['X-RateLimit-Remaining'] = str(remaining)
        response['X-RateLimit-Limit'] = str(limit)
        response['X-Ambient-User'] = 'true' if is_ambient_user else 'false'
        
        return response
    
    return wrapper


# cors_exempt + helpers come from extension.cors_helpers (imported above as _shared_cors_exempt).
# Re-export under the local name so existing @cors_exempt usages below stay unchanged.
cors_exempt = _shared_cors_exempt


def get_api_key():
    """Get the Gemini API key from settings."""
    api_key = getattr(settings, 'DEFAULT_API_KEY', None)
    if not api_key:
        raise ValueError("DEFAULT_API_KEY not configured in settings")
    return api_key


def call_gemini_with_retry(client, model_name: str, prompt: str, config: dict, max_retries: int = 3):
    """
    Call Gemini API with retry logic for transient errors.
    
    Args:
        client: Gemini client instance
        model_name: Model to use
        prompt: The prompt to send
        config: Generation config
        max_retries: Maximum number of retry attempts
        
    Returns:
        The response text from Gemini
        
    Raises:
        Exception if all retries fail
    """
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config
            )
            
            # Check for error strings in response text
            if response_text(response):
                if "Error processing request: 500 INTERNAL." in response_text(response):
                    time.sleep(attempt + 1)
                    continue
                if "503 UNAVAILABLE." in response_text(response):
                    time.sleep(attempt + 1)
                    continue
            
            return response_text(response)
            
        except Exception as e:
            error_msg = str(e)
            if any(code in error_msg for code in ["500", "503", "UNAVAILABLE", "INTERNAL"]):
                time.sleep(attempt + 1)
                if attempt == max_retries - 1:
                    raise Exception(f"Gemini API error after {max_retries} attempts: {error_msg}")
            else:
                raise
    
    raise Exception("Gemini API error: max retries exceeded")


@csrf_exempt
@cors_exempt
@require_google_auth
@require_http_methods(["POST", "OPTIONS"])
def extract_event(request):
    """
    Extract events from a conversation using Gemini AI.
    
    POST /extension_endpoint/extract_event/
    
    Headers:
        Authorization: Bearer <google_oauth_token>
    
    Request body:
    {
        "conversation": {
            "title": str,
            "structured_messages": [
                {"date": str, "sender": str, "text": str},
                ...
            ],
            "participants": [str, ...] (optional)
        },
        "user_name": str
    }
    
    Response:
    {
        "success": bool,
        "events": [...] or null,
        "error": str or null
    }
    """
    try:
        # Parse request body
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError as e:
            return JsonResponse({
                "success": False,
                "events": None,
                "error": f"Invalid JSON: {str(e)}"
            }, status=400)
        
        # Validate request
        is_valid, error = validate_extract_request(data)
        if not is_valid:
            return JsonResponse({
                "success": False,
                "events": None,
                "error": error
            }, status=400)
        
        conversation = data['conversation']
        user_name = data['user_name'].strip()
        
        # Build the prompt using existing extraction logic
        # Note: We pass None for user since extension users don't have Django accounts
        instructions = get_text_event_extraction_instructions(user_name, user=None)
        formatted_input = format_conversation_for_event_extraction(conversation)
        prompt = instructions + formatted_input
        
        # Get API key and create client
        api_key = get_api_key()
        client = genai.Client(api_key=api_key)
        
        config = {
            "response_mime_type": "application/json",
        }
        
        # Call Gemini
        response_text = call_gemini_with_retry(client, DEFAULT_MODEL, prompt, config)
        
        # Parse the response
        try:
            parsed_events = sanitize_and_parse_json(response_text, can_log=False)
        except Exception as e:
            return JsonResponse({
                "success": False,
                "events": None,
                "error": f"Failed to parse AI response: {str(e)}"
            }, status=500)
        
        # Ensure response is a list
        if isinstance(parsed_events, dict):
            parsed_events = [parsed_events]
        
        return JsonResponse({
            "success": True,
            "events": parsed_events,
            "error": None,
            "is_ambient_user": request.is_ambient_user
        })
        
    except ValueError as e:
        # Configuration errors (e.g., missing API key)
        return JsonResponse({
            "success": False,
            "events": None,
            "error": str(e)
        }, status=500)
        
    except Exception as e:
        return JsonResponse({
            "success": False,
            "events": None,
            "error": f"Internal error: {str(e)}"
        }, status=500)


@csrf_exempt
@cors_exempt
@require_google_auth
@require_http_methods(["POST", "OPTIONS"])
def find_matches(request):
    """
    Match an extracted event against calendar events using Gemini AI.
    
    POST /extension_endpoint/find_matches/
    
    Headers:
        Authorization: Bearer <google_oauth_token>
    
    Request body:
    {
        "event": {
            "event_type": str,
            "summary": str,
            "description": str,
            "location": str (optional),
            "start": {...} (optional),
            "end": {...} (optional),
            ...
        },
        "calendar_events": [
            {
                "id": str,
                "summary": str,
                "description": str,
                ...
            },
            ...
        ]
    }
    
    Response:
    {
        "success": bool,
        "match_result": {...} or null,
        "error": str or null
    }
    """
    try:
        # Parse request body
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError as e:
            return JsonResponse({
                "success": False,
                "match_result": None,
                "error": f"Invalid JSON: {str(e)}"
            }, status=400)
        
        # Validate request
        is_valid, error = validate_match_request(data)
        if not is_valid:
            return JsonResponse({
                "success": False,
                "match_result": None,
                "error": error
            }, status=400)
        
        event = data['event']
        calendar_events = data['calendar_events']
        
        # If no calendar events to match against, return no_match immediately
        if len(calendar_events) == 0:
            return JsonResponse({
                "success": True,
                "match_result": {
                    "match_data": {
                        "match_type": "no_match",
                        "matched_event": None,
                        "matched_event_id": None
                    }
                },
                "error": None,
                "is_ambient_user": request.is_ambient_user
            })
        
        # Build the prompt using existing matching logic
        prompt = generate_event_match_instructions(
            event_input=event,
            calendar_input=calendar_events
        )
        
        # Get API key and create client
        api_key = get_api_key()
        client = genai.Client(api_key=api_key)
        
        config = {
            "response_mime_type": "application/json",
        }
        
        # Call Gemini
        response_text = call_gemini_with_retry(client, DEFAULT_MODEL, prompt, config)
        
        # Parse the response
        try:
            match_result = sanitize_and_parse_json(response_text, can_log=False)
        except Exception as e:
            return JsonResponse({
                "success": False,
                "match_result": None,
                "error": f"Failed to parse AI response: {str(e)}"
            }, status=500)
        
        return JsonResponse({
            "success": True,
            "match_result": match_result,
            "error": None,
            "is_ambient_user": request.is_ambient_user
        })
        
    except ValueError as e:
        # Configuration errors (e.g., missing API key)
        return JsonResponse({
            "success": False,
            "match_result": None,
            "error": str(e)
        }, status=500)
        
    except Exception as e:
        return JsonResponse({
            "success": False,
            "match_result": None,
            "error": f"Internal error: {str(e)}"
        }, status=500)


FILE_EXTRACTION_PROMPT = """Extract all calendar events from this document. Return a JSON array where each event has this exact structure:

{
  "event_type": "full_potential_event_details",
  "summary": "<event title>",
  "description": "<any remaining description, color codes, notes, category info, etc.>",
  "location": "<location if mentioned, otherwise null>",
  "start": { "date": "YYYY-MM-DD" },
  "end": { "date": "YYYY-MM-DD" }
}

Rules:
- For all-day events, use "date" in "YYYY-MM-DD" format for start and end.
- For timed events, use "dateTime" in ISO 8601 format (e.g. "2026-03-15T09:00:00") and include "timeZone" (e.g. "America/New_York") instead of "date".
- If the end date/time is not specified, set end equal to start.
- Set event_type to "full_potential_event_details" for all events.
- If a legend or guide is provided (e.g. blue = all day event, yellow = makeup day, red = no school), use it to enhance the description field of each relevant event.
- Include every event you can find in the document, even if some details are incomplete.
- Return ONLY the JSON array, no other text."""


def call_gemini_multimodal_with_retry(client, model_name: str, contents: list, config: dict, max_retries: int = 3):
    """
    Call Gemini API with multimodal contents and retry logic.
    """
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config
            )
            
            if response_text(response):
                if "Error processing request: 500 INTERNAL." in response_text(response):
                    time.sleep(attempt + 1)
                    continue
                if "503 UNAVAILABLE." in response_text(response):
                    time.sleep(attempt + 1)
                    continue
            
            return response_text(response)
            
        except Exception as e:
            error_msg = str(e)
            if any(code in error_msg for code in ["500", "503", "UNAVAILABLE", "INTERNAL"]):
                time.sleep(attempt + 1)
                if attempt == max_retries - 1:
                    raise Exception(f"Gemini API error after {max_retries} attempts: {error_msg}")
            else:
                raise
    
    raise Exception("Gemini API error: max retries exceeded")


@csrf_exempt
@cors_exempt
@require_google_auth
@require_http_methods(["POST", "OPTIONS"])
def extract_from_file(request):
    """
    Extract events from an uploaded file using Gemini AI multimodal.
    
    POST /extension_endpoint/extract_from_file/
    
    Headers:
        Authorization: Bearer <google_oauth_token>
    
    Request body:
    {
        "file_data": str (base64),
        "mime_type": str,
        "file_name": str (optional)
    }
    
    Response:
    {
        "success": bool,
        "events": [...] or null,
        "error": str or null
    }
    """
    try:
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError as e:
            return JsonResponse({
                "success": False,
                "events": None,
                "error": f"Invalid JSON: {str(e)}"
            }, status=400)
        
        is_valid, error = validate_file_extract_request(data)
        if not is_valid:
            return JsonResponse({
                "success": False,
                "events": None,
                "error": error
            }, status=400)
        
        file_data = data['file_data']
        mime_type = data['mime_type'].strip()
        
        try:
            file_bytes = base64.b64decode(file_data)
        except Exception as e:
            return JsonResponse({
                "success": False,
                "events": None,
                "error": f"Invalid base64 data: {str(e)}"
            }, status=400)
        
        api_key = get_api_key()
        client = genai.Client(api_key=api_key)
        
        config = {
            "response_mime_type": "application/json",
        }
        
        contents = [
            types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
            FILE_EXTRACTION_PROMPT,
        ]
        
        response_text = call_gemini_multimodal_with_retry(client, DEFAULT_MODEL, contents, config)
        
        try:
            parsed_events = sanitize_and_parse_json(response_text, can_log=False)
        except Exception as e:
            return JsonResponse({
                "success": False,
                "events": None,
                "error": f"Failed to parse AI response: {str(e)}"
            }, status=500)
        
        if isinstance(parsed_events, dict):
            parsed_events = [parsed_events]
        
        return JsonResponse({
            "success": True,
            "events": parsed_events,
            "error": None,
            "is_ambient_user": request.is_ambient_user
        })
        
    except ValueError as e:
        return JsonResponse({
            "success": False,
            "events": None,
            "error": str(e)
        }, status=500)
        
    except Exception as e:
        return JsonResponse({
            "success": False,
            "events": None,
            "error": f"Internal error: {str(e)}"
        }, status=500)


@csrf_exempt
@cors_exempt
@require_http_methods(["GET", "OPTIONS"])
def health_check(request):
    """
    Health check endpoint for the extension API.
    
    GET /extension_endpoint/health/
    
    Response:
    {
        "status": "ok",
        "api_configured": bool
    }
    """
    api_configured = bool(getattr(settings, 'DEFAULT_API_KEY', None))
    
    return JsonResponse({
        "status": "ok",
        "api_configured": api_configured
    })


@csrf_exempt
@cors_exempt
@require_http_methods(["GET", "OPTIONS"])
def check_profile(request):
    """
    Check if the user has an Ambient profile linked to their Google account.
    
    This endpoint verifies the Google OAuth token and checks if the email
    matches a registered Ambient user. Does NOT count against rate limits.
    
    GET /extension_endpoint/check_profile/
    
    Headers:
        Authorization: Bearer <google_oauth_token>
    
    Response:
    {
        "success": bool,
        "is_ambient_user": bool,
        "email": str (masked),
        "error": str or null
    }
    """
    # Handle OPTIONS preflight
    if request.method == 'OPTIONS':
        return HttpResponse()
    
    # Extract token from Authorization header
    auth_header = request.headers.get('Authorization', '')
    
    if not auth_header.startswith('Bearer '):
        return JsonResponse({
            'success': False,
            'is_ambient_user': False,
            'email': None,
            'error': 'Missing or invalid Authorization header',
        }, status=401)
    
    token = auth_header[7:]  # Remove 'Bearer ' prefix
    
    if not token or len(token) < 20:
        return JsonResponse({
            'success': False,
            'is_ambient_user': False,
            'email': None,
            'error': 'Invalid token format',
        }, status=401)
    
    # Verify token with Google
    userinfo = verify_google_token(token)
    
    if not userinfo:
        return JsonResponse({
            'success': False,
            'is_ambient_user': False,
            'email': None,
            'error': 'Invalid or expired Google token. Please reconnect your calendar.',
        }, status=401)
    
    user_email = userinfo.get('email', '')
    
    # Mask email for privacy in response (show first 3 chars and domain)
    if user_email and '@' in user_email:
        local_part, domain = user_email.split('@', 1)
        masked_email = f"{local_part[:3]}***@{domain}" if len(local_part) > 3 else f"{local_part[0]}***@{domain}"
    else:
        masked_email = '***'
    
    # Check if user has an Ambient profile
    is_ambient_user = check_ambient_profile(user_email)
    
    return JsonResponse({
        'success': True,
        'is_ambient_user': is_ambient_user,
        'email': masked_email,
        'error': None,
    })


# ============ Calendar Agent Endpoint ============

# Higher rate limits for calendar agent (a single session uses 10-20 calls)
CA_RATE_LIMIT_REQUESTS_DEFAULT = 20
CA_RATE_LIMIT_REQUESTS_AMBIENT = 50
CA_RATE_LIMIT_WINDOW = 86400  # 24 hours


def check_calendar_agent_rate_limit(user_id: str, is_ambient_user: bool = False) -> tuple[bool, int, int]:
    """Rate limiter specifically for calendar agent sessions."""
    cache_key = f"ratelimit:calendar_agent:{user_id}"
    limit = CA_RATE_LIMIT_REQUESTS_AMBIENT if is_ambient_user else CA_RATE_LIMIT_REQUESTS_DEFAULT
    current_count = cache.get(cache_key, 0)
    remaining = limit - current_count

    if current_count >= limit:
        return False, 0, limit

    new_count = current_count + 1
    cache.set(cache_key, new_count, timeout=CA_RATE_LIMIT_WINDOW)
    return True, remaining - 1, limit


def require_google_auth_calendar_agent(view_func):
    """
    Auth decorator for calendar agent endpoint.
    Uses separate, higher rate limits than the standard extraction endpoints.
    """
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if request.method == 'OPTIONS':
            return view_func(request, *args, **kwargs)

        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return JsonResponse({
                'success': False, 'error': 'Missing or invalid Authorization header',
                'response': None,
            }, status=401)

        token = auth_header[7:]
        if not token or len(token) < 20:
            return JsonResponse({
                'success': False, 'error': 'Invalid token format', 'response': None,
            }, status=401)

        userinfo = verify_google_token(token)
        if not userinfo:
            return JsonResponse({
                'success': False,
                'error': 'Invalid or expired Google token. Please reconnect your calendar.',
                'response': None,
            }, status=401)

        user_id = userinfo['sub']
        user_email = userinfo.get('email', '')
        is_ambient_user = check_ambient_profile(user_email)

        allowed, remaining, limit = check_calendar_agent_rate_limit(user_id, is_ambient_user)
        if not allowed:
            response = JsonResponse({
                'success': False,
                'error': 'Calendar agent rate limit exceeded. Please try again later.',
                'response': None,
                'is_ambient_user': is_ambient_user,
            }, status=429)
            response['X-RateLimit-Remaining'] = '0'
            response['X-RateLimit-Limit'] = str(limit)
            response['X-Ambient-User'] = 'true' if is_ambient_user else 'false'
            return response

        request.google_user_id = user_id
        request.is_ambient_user = is_ambient_user

        response = view_func(request, *args, **kwargs)
        response['X-RateLimit-Remaining'] = str(remaining)
        response['X-RateLimit-Limit'] = str(limit)
        response['X-Ambient-User'] = 'true' if is_ambient_user else 'false'
        return response

    return wrapper


@csrf_exempt
@cors_exempt
@require_google_auth_calendar_agent
@require_http_methods(["POST", "OPTIONS"])
def calendar_agent(request):
    """
    Calendar agent LLM endpoint. Handles Planner, Extractor, Interactor, and Categorizer roles.

    POST /extension_endpoint/calendar_agent/

    Headers:
        Authorization: Bearer <google_oauth_token>

    Request body:
    {
        "role": "planner" | "extractor" | "interactor" | "categorizer",
        "system_prompt": str,
        "user_message": str
    }

    Response:
    {
        "success": bool,
        "response": str (raw LLM response text) or null,
        "error": str or null
    }
    """
    try:
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError as e:
            return JsonResponse({
                "success": False, "response": None,
                "error": f"Invalid JSON: {str(e)}"
            }, status=400)

        role = data.get('role', '')
        system_prompt = data.get('system_prompt', '')
        user_message = data.get('user_message', '')

        if role not in ('planner', 'extractor', 'interactor', 'categorizer'):
            return JsonResponse({
                "success": False, "response": None,
                "error": f"Invalid role: {role}. Must be planner, extractor, interactor, or categorizer."
            }, status=400)

        if not system_prompt or not user_message:
            return JsonResponse({
                "success": False, "response": None,
                "error": "system_prompt and user_message are required."
            }, status=400)

        api_key = get_api_key()
        client = genai.Client(api_key=api_key)

        config = {
            "response_mime_type": "application/json",
            "system_instruction": system_prompt,
            "max_output_tokens": 65536,
        }

        response_text = call_gemini_with_retry(client, DEFAULT_MODEL, user_message, config)

        return JsonResponse({
            "success": True,
            "response": response_text,
            "error": None,
            "is_ambient_user": request.is_ambient_user,
        })

    except ValueError as e:
        return JsonResponse({
            "success": False, "response": None, "error": str(e)
        }, status=500)

    except Exception as e:
        return JsonResponse({
            "success": False, "response": None,
            "error": f"Internal error: {str(e)}"
        }, status=500)


@csrf_exempt
@cors_exempt
@require_google_auth_calendar_agent
@require_http_methods(["POST", "OPTIONS"])
def submit_page_url(request):
    """
    Accept a URL submission from the calendar agent when no known platform
    is detected. Stored so Ambient can prioritize building new extractors.

    POST /extension_endpoint/submit_page_url/

    Headers:
        Authorization: Bearer <google_oauth_token>

    Request body:
    {
        "url": str,
        "page_title": str (optional)
    }

    Response:
    {
        "success": bool,
        "error": str or null
    }
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError as e:
        return JsonResponse({
            "success": False,
            "error": f"Invalid JSON: {str(e)}"
        }, status=400)

    url = data.get('url', '').strip()
    if not url:
        return JsonResponse({
            "success": False,
            "error": "Missing required field: url"
        }, status=400)

    if len(url) > 2048:
        return JsonResponse({
            "success": False,
            "error": "URL exceeds maximum length of 2048 characters"
        }, status=400)

    from urllib.parse import urlparse
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        return JsonResponse({
            "success": False,
            "error": "Invalid URL: must be an http or https URL"
        }, status=400)

    domain = parsed.netloc.lower()
    page_title = data.get('page_title', '')[:512]

    try:
        from .models import PageSubmission
        PageSubmission.objects.create(
            url=url,
            domain=domain,
            page_title=page_title,
            google_user_id=request.google_user_id,
        )
    except Exception as e:
        return JsonResponse({
            "success": False,
            "error": f"Failed to save submission: {str(e)}"
        }, status=500)

    return JsonResponse({
        "success": True,
        "error": None,
    })


# ---------------------------------------------------------------------------
# Trip creation (extension path)
# ---------------------------------------------------------------------------

@csrf_exempt
@cors_exempt
@require_google_auth
@require_http_methods(["POST", "OPTIONS"])
def create_trip(request):
    """Persist a trip + its sibling events from the extension's already-extracted output.

    The extension does the heavy lifting client-side: scrape conversation, run extraction
    via /extract_event/, create a per-trip Google Calendar via the user's OAuth token, and
    insert events. This endpoint just creates DB records (Trip + sibling CalendarUpdates)
    and returns a share URL so the extension can store + display it.

    Request body shape:
      {
        "trip_event": <ExtractedEvent>,           // the parent trip event (summary contains "trip")
        "sibling_events": [<ExtractedEvent>, ...], // other events from the same scrape
        "google_calendar_id": "<gcal id>",         // calendar already created client-side
        "set_calendar_public_read": true           // whether the server should also set ACL
      }

    Auth: Google OAuth token (existing extension pattern). The token's `sub` and `email`
    are stored on the Trip as `creator_google_sub` and `creator_email` so an Ambient signup
    using the same Google account triggers auto-claim later.
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"success": False, "error": "Invalid JSON"}, status=400)

    trip_event = data.get("trip_event") or {}
    sibling_events = data.get("sibling_events") or []
    google_calendar_id = data.get("google_calendar_id")

    if not trip_event.get("summary"):
        return JsonResponse({"success": False, "error": "trip_event.summary is required"}, status=400)
    if 'trip' not in trip_event["summary"].lower():
        return JsonResponse({"success": False, "error": "trip_event.summary must contain 'trip'"}, status=400)

    # If the request comes from a signed-in Ambient user (same email), use them as the
    # owner. Otherwise the trip is created anonymously and can be auto-claimed later.
    from users.models import CustomUser
    from trips.models import Trip
    from autoscheduler.models import CalendarUpdate

    creator_user = None
    if request.google_user_email:
        creator_user = CustomUser.objects.filter(email__iexact=request.google_user_email).first()

    try:
        trip = Trip.objects.create(
            conversation=None,  # extension trips aren't bound to an Ambient Conversation record
            summary=trip_event.get("summary"),
            description=trip_event.get("description") or '',
            location=trip_event.get("location") or None,
            start=trip_event.get("start") or None,
            end=trip_event.get("end") or None,
            event_type=trip_event.get("event_type") or 'full_potential_event_details',
            match_type='no_match',
            accommodation_details=trip_event.get("trip_accommodation_details") or None,
            google_calendar_id=google_calendar_id,
            created_by=creator_user,
            creator_google_sub=request.google_user_id,
            creator_email=request.google_user_email,
            status='active',
        )
        # The parent trip event's CalendarUpdate row IS the Trip (multi-table inheritance).
        # Self-reference the FK so trip detail queries pick it up.
        trip.trip = trip
        trip.save(update_fields=['trip'])

        if creator_user is not None:
            trip.tracked_by.add(creator_user)
    except Exception as e:
        return JsonResponse({"success": False, "error": f"Failed to create trip: {e}"}, status=500)

    # Sibling events. Each becomes a CalendarUpdate with FK to the Trip.
    created_event_count = 0
    for ev in sibling_events:
        if not ev.get("summary"):
            continue
        try:
            CalendarUpdate.objects.create(
                conversation=None,
                trip=trip,
                summary=ev.get("summary"),
                description=ev.get("description") or '',
                location=ev.get("location") or None,
                start=ev.get("start") or None,
                end=ev.get("end") or None,
                event_type=ev.get("event_type") or 'full_potential_event_details',
                match_type='no_match',
                flight_details=ev.get("flight_details") or None,
            )
            created_event_count += 1
        except Exception as e:
            print(f"create_trip: failed to create sibling CU for {ev.get('summary')}: {e}")
            continue

    # Best-effort public-read ACL. The extension may have already set it client-side; this
    # is a backstop in case it didn't.
    if data.get("set_calendar_public_read", False) and google_calendar_id and creator_user is not None:
        try:
            from gcal_functions import (
                dict_to_credentials, refresh_credentials_if_needed, build_calendar_service,
                set_calendar_public_read,
            )
            if creator_user.gcal_creds:
                creds = refresh_credentials_if_needed(dict_to_credentials(creator_user.gcal_creds))
                service = build_calendar_service(creds)
                set_calendar_public_read(service, google_calendar_id)
        except Exception as e:
            print(f"create_trip: backstop ACL set failed: {e}")

    share_url = request.build_absolute_uri(f"/trip/{trip.share_token}/")

    return JsonResponse({
        "success": True,
        "trip_id": trip.pk,
        "share_token": str(trip.share_token),
        "share_url": share_url,
        "events_created": created_event_count,
        "is_ambient_user": request.is_ambient_user,
        "error": None,
    })
