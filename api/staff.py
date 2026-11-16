from http.server import BaseHTTPRequestHandler

from engine.handlers import handle_staff
from engine.vercel import make_handler


class handler(make_handler(handle_staff), BaseHTTPRequestHandler):
    """Vercel entry point: POST /api/staff (owner: invite a staff member)."""
