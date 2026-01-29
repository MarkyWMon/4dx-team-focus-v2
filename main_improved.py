import os
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

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
app = Flask(__name__)

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,OPTIONS'
    return response

@app.route("/", methods=["GET", "OPTIONS"])
def proxy():
    if request.method == "OPTIONS":
        return make_response("", 204)

    # --- CONFIGURATION ---
    WHD_URL = "https://herbert.bhasvic.ac.uk:8443/helpdesk/WebObjects/Helpdesk.woa/ra/Tickets"
    API_KEY = os.environ.get("WHD_API_KEY", "EjydpRVHJxqIjIfWLVYbfjH5dQ1EaxQTp8GodeUK")
    
    # Allow frontend to specify list type via query param, default to None (all tickets)
    list_type = request.args.get('list', None)
    limit = int(request.args.get('limit', 250))

    try:
        params = {
            "apiKey": API_KEY,
            "limit": limit
        }
        
        # Only add list parameter if specified
        if list_type:
            params["list"] = list_type
        
        logger.info(f"Fetching tickets from WHD with params: {params}")
        
        r = requests.get(
            WHD_URL,
            params=params,
            timeout=25,
            verify=False
        )
        
        logger.info(f"WHD Response Status: {r.status_code}")
        logger.info(f"WHD Response Headers: {dict(r.headers)}")
        
        if r.status_code != 200:
            logger.error(f"WHD returned non-200 status: {r.status_code}")
            logger.error(f"Response body: {r.text[:500]}")
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
    port = int(os.environ.get("PORT", 8080))
    logger.info(f"Starting WHD Proxy on port {port}")
    app.run(host="0.0.0.0", port=port)
