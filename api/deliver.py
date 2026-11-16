from engine.handlers import handle_deliver
from engine.vercel import make_handler

handler = make_handler(handle_deliver)
