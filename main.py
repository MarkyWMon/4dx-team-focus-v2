import os
import sys
import requests
import urllib3
import logging
from functools import wraps
from flask import Flask, jsonify, request, make_response

import firebase_admin
from firebase_admin import auth as firebase_auth

# Configure logging for Cloud Run
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# --- SECURITY CONFIGURATION ---
# Allowed origins for CORS - only allow your Firebase Hosting domains
ALLOWED_ORIGINS = [
    # Primary project (bhasvic-4dx-v2)
    "https://bhasvic-4dx-v2.web.app",
    "https://bhasvic-4dx-v2.firebaseapp.com",
    # Secondary project (bhasvic4dx-483420)
    "https://bhasvic4dx-483420.web.app",
    "https://bhasvic4dx-483420.firebaseapp.com",
    # Development only
    "http://localhost:3000",
    "http://localhost:5173",
]

# Every caller must present a Firebase ID token for an account on this domain.
ALLOWED_EMAIL_DOMAIN = os.environ.get("ALLOWED_EMAIL_DOMAIN", "bhasvic.ac.uk").lower()

# TLS verification for the upstream WHD server. Defaults ON. If the helpdesk
# uses an internal CA, mount its bundle and point WHD_CA_BUNDLE at it rather
# than disabling verification.
WHD_CA_BUNDLE = os.environ.get("WHD_CA_BUNDLE")
WHD_TLS_VERIFY = os.environ.get("WHD_TLS_VERIFY", "true").lower() != "false"
UPSTREAM_VERIFY = WHD_CA_BUNDLE if WHD_CA_BUNDLE else WHD_TLS_VERIFY
if not WHD_TLS_VERIFY:
    logger.warning("WHD_TLS_VERIFY=false — upstream TLS verification is DISABLED. Fix the WHD certificate.")
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Models the client is allowed to request through the AI proxy.
ALLOWED_GEMINI_MODELS = {
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
}

# Uses Application Default Credentials on Cloud Run.
firebase_admin.initialize_app(options={
    "projectId": os.environ.get("FIREBASE_PROJECT_ID", "bhasvic-4dx-v2"),
})


def get_cors_origin(request_origin):
    """Return the origin if it's in the allowed list, otherwise None."""
    if request_origin in ALLOWED_ORIGINS:
        return request_origin
    return None


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get('Origin', '')
    allowed_origin = get_cors_origin(origin)

    if allowed_origin:
        response.headers['Access-Control-Allow-Origin'] = allowed_origin
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
        response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    # If origin not allowed, don't add CORS headers (browser will block)

    return response


def require_firebase_user(f):
    """Reject any request that lacks a valid Firebase ID token for a college account.

    CORS is a browser-only control; this is what actually stops curl/scripts.
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        if request.method == "OPTIONS":
            return make_response("", 204)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Unauthorized", "details": "Missing bearer token."}), 401
        token = auth_header[len("Bearer "):].strip()

        try:
            decoded = firebase_auth.verify_id_token(token)
        except Exception as e:
            logger.warning(f"Rejected invalid ID token: {e}")
            return jsonify({"error": "Unauthorized", "details": "Invalid or expired token."}), 401

        email = (decoded.get("email") or "").lower()
        if not email.endswith(f"@{ALLOWED_EMAIL_DOMAIN}"):
            logger.warning(f"Rejected token for out-of-domain account: {email or '<no email>'}")
            return jsonify({"error": "Forbidden", "details": "Account is not on the allowed domain."}), 403

        request.firebase_user = decoded
        return f(*args, **kwargs)
    return wrapper


@app.route("/", methods=["GET", "OPTIONS"])
@require_firebase_user
def proxy():
    # --- CONFIGURATION ---
    WHD_URL = "https://herbert.bhasvic.ac.uk:8443/helpdesk/WebObjects/Helpdesk.woa/ra/Tickets"

    # SECURITY: API key MUST be set via environment variable - no default fallback
    API_KEY = os.environ.get("WHD_API_KEY")
    if not API_KEY:
        logger.error("FATAL: WHD_API_KEY environment variable is not set!")
        return jsonify({
            "error": "Server Configuration Error",
            "details": "WHD_API_KEY environment variable is required but not set."
        }), 500

    # Allow frontend to specify list type via query param, default to 'mine'
    # SolarWinds WHD API REQUIRES a list parameter: mine|group|flagged|recent
    list_type = request.args.get('list', 'mine')
    limit = int(request.args.get('limit', 250))

    try:
        params = {
            "apiKey": API_KEY,
            "limit": limit,
            "list": list_type
        }

        logger.info(f"Fetching tickets from WHD with list={list_type}, limit={limit}")

        r = requests.get(
            WHD_URL,
            params=params,
            timeout=25,
            verify=UPSTREAM_VERIFY
        )

        logger.info(f"WHD Response Status: {r.status_code}")

        if r.status_code != 200:
            logger.error(f"WHD returned non-200 status: {r.status_code}")
            logger.error(f"Response body preview: {r.text[:500]}")
            return jsonify({
                "error": f"WHD Response {r.status_code}",
                "details": "Helpdesk server rejected the request. Check your API Key permissions.",
                "response_preview": r.text[:200]
            }), 502

        data = r.json()
        logger.info(f"Received {len(data) if isinstance(data, list) else 1} ticket(s)")

        # If the API returns a single dictionary instead of a list, wrap it
        if isinstance(data, dict):
            if "id" in data:
                data = [data]
            else:
                # Might be an error response or metadata wrapper
                logger.warning(f"Unexpected dict response: {list(data.keys())}")

        return jsonify(data)

    except requests.exceptions.SSLError as e:
        logger.error(f"SSL Error: {str(e)}")
        return jsonify({
            "error": "SSL Error",
            "details": "Could not verify the helpdesk server's TLS certificate. "
                       "Set WHD_CA_BUNDLE to the internal CA bundle path."
        }), 502
    except requests.exceptions.Timeout:
        logger.error("Request timed out after 25 seconds")
        return jsonify({"error": "Timeout", "details": "WHD server took too long to respond"}), 504
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return jsonify({"error": "Connection Failed", "details": str(e)}), 502


@app.route("/ai", methods=["POST", "OPTIONS"])
@require_firebase_user
def ai_proxy():
    """Server-side Gemini proxy so the API key never ships in the client bundle."""
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
    if not GEMINI_API_KEY:
        logger.error("FATAL: GEMINI_API_KEY environment variable is not set!")
        return jsonify({
            "error": "Server Configuration Error",
            "details": "GEMINI_API_KEY environment variable is required but not set."
        }), 500

    body = request.get_json(silent=True) or {}
    model = body.get("model")
    prompt = body.get("prompt")
    json_mode = bool(body.get("json"))

    if model not in ALLOWED_GEMINI_MODELS:
        return jsonify({"error": "Bad Request", "details": f"Model not allowed: {model}"}), 400
    if not isinstance(prompt, str) or not prompt.strip():
        return jsonify({"error": "Bad Request", "details": "Missing prompt."}), 400
    if len(prompt) > 100_000:
        return jsonify({"error": "Bad Request", "details": "Prompt too large."}), 400

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
    }
    if json_mode:
        payload["generationConfig"] = {"responseMimeType": "application/json"}

    try:
        user_email = request.firebase_user.get("email", "unknown")
        logger.info(f"Gemini call model={model} json={json_mode} user={user_email}")
        r = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            params={"key": GEMINI_API_KEY},
            json=payload,
            timeout=55,
        )
        if r.status_code != 200:
            logger.error(f"Gemini returned {r.status_code}: {r.text[:300]}")
            # Pass the status through so the client's rate-limit fallback works.
            return jsonify({
                "error": f"Gemini Response {r.status_code}",
                "details": r.text[:300]
            }), r.status_code
        return jsonify(r.json())
    except requests.exceptions.Timeout:
        return jsonify({"error": "Timeout", "details": "Gemini took too long to respond"}), 504
    except Exception as e:
        logger.error(f"Gemini proxy error: {str(e)}", exc_info=True)
        return jsonify({"error": "Connection Failed", "details": str(e)}), 502


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint for Cloud Run"""
    return jsonify({"status": "healthy", "service": "whd-proxy"}), 200


if __name__ == "__main__":
    # Validate required configuration at startup
    if not os.environ.get("WHD_API_KEY"):
        logger.error("=" * 60)
        logger.error("FATAL: WHD_API_KEY environment variable is not set!")
        logger.error("Set this variable before running the server.")
        logger.error("=" * 60)
        sys.exit(1)

    port = int(os.environ.get("PORT", 8080))
    logger.info(f"Starting WHD Proxy on port {port}")
    logger.info(f"CORS allowed origins: {ALLOWED_ORIGINS}")
    app.run(host="0.0.0.0", port=port)
