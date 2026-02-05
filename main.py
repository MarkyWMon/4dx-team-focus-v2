import os
import sys
import requests
import urllib3
import logging
from flask import Flask, jsonify, request, make_response

# Configure logging for Cloud Run
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# SSL Warning: Disabled due to internal server certificate configuration
# TODO: Proper fix requires updating upstream server's SSL certificate
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

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
        response.headers['Access-Control-Allow-Methods'] = 'GET,OPTIONS'
    # If origin not allowed, don't add CORS headers (browser will block)
    
    return response

@app.route("/", methods=["GET", "OPTIONS"])
def proxy():
    if request.method == "OPTIONS":
        return make_response("", 204)

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
        
        # NOTE: verify=False is required because the internal helpdesk server
        # uses a self-signed or internal CA certificate.
        # TODO: Add the internal CA to trusted certs for proper verification
        r = requests.get(
            WHD_URL,
            params=params,
            timeout=25,
            verify=False  # See note above - internal server cert issue
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
        return jsonify({"error": "SSL Error", "details": str(e)}), 502
    except requests.exceptions.Timeout:
        logger.error("Request timed out after 25 seconds")
        return jsonify({"error": "Timeout", "details": "WHD server took too long to respond"}), 504
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
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
