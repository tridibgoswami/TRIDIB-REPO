"""
APScheduler jobs:
  09:00 IST → login, reset state, start server
  Every 5 min  → check daily P&L / loss limit
  Every 30 s   → poll order fills
  15:15 IST → auto square-off
  15:30 IST → logout, stop server, send day summary
"""

import threading
import time
import uvicorn
import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger

from config import config
from angelone_client import angelone
from telegram_notifier import notifier
from trade_manager import trade_manager
from webhook_server import app

IST = pytz.timezone("Asia/Kolkata")

_server_thread: threading.Thread | None = None
_uvicorn_server: uvicorn.Server | None = None


# ── Uvicorn lifecycle ─────────────────────────────────────────────────────────

def _start_webhook_server():
    global _uvicorn_server, _server_thread

    cfg = uvicorn.Config(
        app=app,
        host=config.WEBHOOK_HOST,
        port=config.WEBHOOK_PORT,
        log_level="warning",
    )
    _uvicorn_server = uvicorn.Server(cfg)

    _server_thread = threading.Thread(target=_uvicorn_server.run, daemon=True)
    _server_thread.start()
    logger.info(f"Webhook server started on {config.WEBHOOK_HOST}:{config.WEBHOOK_PORT}")


def _stop_webhook_server():
    global _uvicorn_server
    if _uvicorn_server:
        _uvicorn_server.should_exit = True
        logger.info("Webhook server stopped")


# ── Scheduled jobs ────────────────────────────────────────────────────────────

def job_morning_start():
    logger.info("=== BOT MORNING START ===")
    trade_manager.reset_daily_state()

    if not angelone.login():
        notifier.error_alert("AngelOne login failed at market open. Bot inactive.")
        return

    _start_webhook_server()
    notifier.bot_started()


def job_check_pnl():
    if not angelone._logged_in:
        return
    try:
        trade_manager.check_daily_loss()
    except Exception as e:
        logger.error(f"P&L check error: {e}")


def job_poll_fills():
    """Poll order book and update fill status for tracked orders."""
    if not angelone._logged_in:
        return
    try:
        orders = angelone.get_order_book()
        for order in orders:
            oid = order.get("orderid")
            ostatus = order.get("status", "").upper()
            if ostatus == "COMPLETE" and oid in trade_manager._open_positions:
                fill_price = float(order.get("averageprice", 0))
                trade_manager.update_fill(oid, fill_price)
    except Exception as e:
        logger.error(f"Fill poll error: {e}")


def job_square_off():
    logger.info("=== AUTO SQUARE-OFF ===")
    if not angelone._logged_in:
        return
    try:
        trade_manager.square_off_all()
    except Exception as e:
        logger.error(f"Square-off error: {e}")
        notifier.error_alert(f"Square-off failed: {e}")


def job_eod_stop():
    logger.info("=== BOT EOD STOP ===")
    pnl = trade_manager._daily_pnl
    notifier.bot_stopped(pnl)
    _stop_webhook_server()
    angelone.logout()
    logger.info("=== SESSION COMPLETE ===")


# ── Scheduler setup ───────────────────────────────────────────────────────────

def build_scheduler() -> BackgroundScheduler:
    sq_h, sq_m = config.SQUARE_OFF_TIME.split(":")

    sched = BackgroundScheduler(timezone=IST)

    sched.add_job(job_morning_start, CronTrigger(hour=9, minute=0, timezone=IST),
                  id="morning_start", replace_existing=True)

    sched.add_job(job_check_pnl, "interval", minutes=5,
                  id="pnl_check", replace_existing=True)

    sched.add_job(job_poll_fills, "interval", seconds=30,
                  id="fill_poll", replace_existing=True)

    sched.add_job(job_square_off, CronTrigger(hour=int(sq_h), minute=int(sq_m), timezone=IST),
                  id="square_off", replace_existing=True)

    sched.add_job(job_eod_stop, CronTrigger(hour=15, minute=30, timezone=IST),
                  id="eod_stop", replace_existing=True)

    return sched
