from http.server import BaseHTTPRequestHandler

from engine.handlers import handle_preview
from engine.vercel import make_handler


class handler(make_handler(handle_preview), BaseHTTPRequestHandler):
    """Vercel entry point: POST /api/preview (admin: render a sample card/certificate)."""
