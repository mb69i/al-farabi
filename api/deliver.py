from http.server import BaseHTTPRequestHandler

from engine.handlers import handle_deliver
from engine.vercel import make_handler


class handler(make_handler(handle_deliver), BaseHTTPRequestHandler):
    """Vercel entry point: POST /api/deliver."""
