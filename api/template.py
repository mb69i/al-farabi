from engine.handlers import handle_template
from engine.vercel import make_handler

handler = make_handler(handle_template)
