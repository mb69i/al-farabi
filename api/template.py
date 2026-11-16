from http.server import BaseHTTPRequestHandler

from engine.handlers import handle_template
from engine.vercel import make_handler


class handler(make_handler(handle_template), BaseHTTPRequestHandler):
    """Vercel entry point: POST /api/template (admin: convert an uploaded design)."""
