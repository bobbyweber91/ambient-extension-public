"""
API endpoints for Chrome extension.
Provides event extraction and calendar matching via AmbientAI's paid Gemini tier.
"""
import json
import time
from functools import wraps
import requests
from django.http import JsonResponse, HttpResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.core.cache import cache
from google import genai

from .validators import validate_extract_request, validate_match_request
from autoscheduler.core.text_extraction.text_extraction_examples import (
    format_conversation_for_event_extraction,
    get_text_event_extraction_instructions
)
from autoscheduler.core.matches.v2_event_match_instructions_and_examples import (
    generate_event_match_instructions
)
from json_utils import sanitize_and_parse_json

# Model to use for API calls
DEFAULT_MODEL = "gemini-2.0-flash"

# Allowed origins for CORS
# NOTE: If the Chrome extension ID changes (e.g., when publishing to Chrome Web Store),
# update the extension ID here and in any other locations that reference it.
ALLOWED_ORIGINS = [
    'chrome-extension://lmmjfddkgnehcnhelddgmlmookgemeop',  # Ambient Chrome extension
    'https://messages.google.com',
    'https://www.messenger.com',
    'https://web.whatsapp.com',
]

# Google OAuth client ID for the Ambient extension
# This is used to verify that tokens were issued for our extension
GOOGLE_CLIENT_ID = '636710672879-jtimq18mggv3ev79itq5uq0f1tpdmf5d.apps.googleusercontent.com'

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
        
        if tokeninfo.get('aud') != GOOGLE_CLIENT_ID:
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
        request.is_ambient_user = is_ambient_user
        
        # Call the actual view
        response = view_func(request, *args, **kwargs)
        
        # Add rate limit and ambient user headers to successful responses
        response['X-RateLimit-Remaining'] = str(remaining)
        response['X-RateLimit-Limit'] = str(limit)
        response['X-Ambient-User'] = 'true' if is_ambient_user else 'false'
        
        return response
    
    return wrapper


def get_cors_origin(request):
    """
    Get the appropriate CORS origin for the request.
    Only allows the specific Ambient extension and messaging sites.
    """
    origin = request.headers.get('Origin', '')
    
    # Allow only specific origins
    if origin in ALLOWED_ORIGINS:
        return origin
    
    # No match - return None (no CORS header will be set)
    return None


def add_cors_headers(response, origin):
    """Add CORS headers to a response for the given origin."""
    if origin:
        response['Access-Control-Allow-Origin'] = origin
        response['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response['Access-Control-Expose-Headers'] = 'X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Limit, X-Ambient-User'
    return response


def cors_exempt(view_func):
    """Decorator to add CORS headers and handle OPTIONS preflight requests."""
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        origin = get_cors_origin(request)
        if request.method == 'OPTIONS':
            response = HttpResponse()
            return add_cors_headers(response, origin)
        response = view_func(request, *args, **kwargs)
        return add_cors_headers(response, origin)
    return wrapper


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
            if response.text:
                if "Error processing request: 500 INTERNAL." in response.text:
                    time.sleep(attempt + 1)
                    continue
                if "503 UNAVAILABLE." in response.text:
                    time.sleep(attempt + 1)
                    continue
            
            return response.text
            
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
