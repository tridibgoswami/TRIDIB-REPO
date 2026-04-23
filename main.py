"""
Entry point — runs three things concurrently:
  1. APScheduler  — market-hours automation (login, square-off, logout)
  2. FastAPI       — TradingView webhook server (background thread)
  3. Telegram bot  — mobile control panel (main asyncio loop)

Usage:
    python main.py
"""

import os
import sys
import asyncio
import threading
import signal as os_signal

import uvicorn
from loguru import logger

from config import config
from angelone_client import angelone
from trade_manager import trade_manager
from telegram_controller import build_application, init_controller
from scheduler import build_scheduler
from webhook_server import app as fastapi_app

# ── Logging ───────────────────────────────────────────────────────────────────
os.makedirs("logs", exist_ok=True)
logger.remove()
logger.add(
    sys.stdout,
    level="INFO",
    format="<green>{time:HH:mm:ss}</green> | <level>{level:<8}</level> | {message}",
    colorize=True,
)
logger.add(
    "logs/bot.log",
    rotation="1 day",
    retention="30 days",
    level="DEBUG",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level:<8} | {message}",
)

# ── Webhook server (background thread) ───────────────────────────────────────

_uvicorn_server: uvicorn.Server | None = None


def start_webhook_server():
    global _uvicorn_server
    cfg = uvicorn.Config(
        app=fastapi_app,
        host=config.WEBHOOK_HOST,
        port=config.WEBHOOK_PORT,
        log_level="warning",
    )
    _uvicorn_server = uvicorn.Server(cfg)
    _uvicorn_server.run()


def launch_webhook_thread():
    t = threading.Thread(target=start_webhook_server, daemon=True, name="webhook")
    t.start()
    logger.info(f"Webhook server started → http://{config.WEBHOOK_HOST}:{config.WEBHOOK_PORT}")
    return t


# ── Scheduler (background) ────────────────────────────────────────────────────

def launch_scheduler():
    sched = build_scheduler()
    sched.start()
    logger.info("Scheduler started — waiting for 09:00 IST")
    return sched


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    # Wire up the Telegram controller with shared singletons
    init_controller(trade_manager, angelone)

    # Start background services
    launch_webhook_thread()
    scheduler = launch_scheduler()

    # Build Telegram bot application
    tg_app = build_application()

    # Graceful shutdown on SIGINT / SIGTERM
    stop_event = asyncio.Event()

    def _handle_signal(sig, frame):
        logger.info(f"Signal {sig} received — shutting down...")
        scheduler.shutdown(wait=False)
        if _uvicorn_server:
            _uvicorn_server.should_exit = True
        stop_event.set()

    os_signal.signal(os_signal.SIGINT, _handle_signal)
    os_signal.signal(os_signal.SIGTERM, _handle_signal)

    logger.info("🚀 Trading bot running — send /start on Telegram to begin")

    async with tg_app:
        await tg_app.start()
        await tg_app.updater.start_polling(drop_pending_updates=True)
        await stop_event.wait()          # block until shutdown signal
        await tg_app.updater.stop()
        await tg_app.stop()

    logger.info("Bot stopped cleanly.")


if __name__ == "__main__":
    asyncio.run(main())
