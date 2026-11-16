from engine.handlers import handle_staff
from engine.vercel import make_handler

handler = make_handler(handle_staff)
