"""
Telegram bot command controller — your mobile trading dashboard.

All commands are restricted to TELEGRAM_CHAT_ID only.
The bot runs in polling mode alongside the FastAPI webhook server.
"""

import asyncio
from datetime import datetime
from typing import Optional

import pytz
from loguru import logger
from telegram import (
    Bot,
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
)
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    ContextTypes,
    MessageHandler,
    filters,
)
from telegram.error import TelegramError

from config import config
from signal_processor import processor, Signal

IST = pytz.timezone("Asia/Kolkata")

# Injected at runtime by main.py to avoid circular imports
_trade_manager = None
_angelone = None


def init_controller(trade_manager, angelone):
    global _trade_manager, _angelone
    _trade_manager = trade_manager
    _angelone = angelone


def _now_ist() -> str:
    return datetime.now(IST).strftime("%d-%b-%Y %I:%M:%S %p")


# ── Auth guard ────────────────────────────────────────────────────────────────

def _authorized(update: Update) -> bool:
    return str(update.effective_chat.id) == str(config.TELEGRAM_CHAT_ID)


async def _deny(update: Update):
    await update.message.reply_text("Unauthorized.")


# ── /start  /help ─────────────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _authorized(update):
        return await _deny(update)

    text = (
        "🤖 <b>Trading Bot — Mobile Control Panel</b>\n"
        "━━━━━━━━━━━━━━━━━━━━━━\n\n"
        "<b>📊 Information</b>\n"
        "  /status   — Bot status &amp; session info\n"
        "  /positions — Open positions\n"
        "  /pnl      — Today's P&amp;L\n"
        "  /orders   — Today's order book\n\n"
        "<b>⚡ Actions</b>\n"
        "  /squareoff — Close all positions\n"
        "  /halt     — Pause new trades\n"
        "  /resume   — Resume trading\n\n"
        "<b>⚙️ Settings</b>\n"
        "  /setlots &lt;qty&gt;    — Change default qty\n"
        "  /setloss &lt;amount&gt; — Change daily loss limit\n\n"
        "<b>📈 Manual Trade</b>\n"
        "  /trade &lt;SYMBOL&gt; &lt;BUY|SELL&gt; &lt;FUT|CE|PE&gt; &lt;EXPIRY&gt; [STRIKE]\n"
        "  Example: /trade NIFTY BUY FUT 29MAY2025\n"
        "  Example: /trade BANKNIFTY SELL PE 29MAY2025 52000\n"
    )
    await update.message.reply_text(text, parse_mode="HTML")


# ── /status ───────────────────────────────────────────────────────────────────

async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _authorized(update):
        return await _deny(update)

    now = datetime.now(IST)
    market_open_time = now.replace(hour=9, minute=15, second=0)
    market_close_time = now.replace(hour=15, minute=30, second=0)
    in_market = market_open_time <= now <= market_close_time

    logged_in = _angelone._logged_in if _angelone else False
    halted = _trade_manager.is_halted if _trade_manager else False
    open_pos = _trade_manager.open_position_count if _trade_manager else 0
    pnl = _trade_manager._daily_pnl if _trade_manager else 0.0

    status_emoji = "🟢" if (logged_in and not halted) else "🔴"
    market_emoji = "🟢" if in_market else "⚫"
    pnl_emoji = "📈" if pnl >= 0 else "📉"

    text = (
        f"{status_emoji} <b>BOT STATUS</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"🔐 Logged In    : {'Yes' if logged_in else 'No'}\n"
        f"🛑 Halted       : {'YES — loss limit hit' if halted else 'No'}\n"
        f"{market_emoji} Market Open    : {'Yes' if in_market else 'No'}\n"
        f"📂 Open Positions: {open_pos} / {config.MAX_OPEN_POSITIONS}\n"
        f"{pnl_emoji} Day P&amp;L      : ₹{pnl:.2f}\n"
        f"🛡 Loss Limit   : ₹{config.MAX_DAILY_LOSS:.2f}\n"
        f"📦 Default Qty  : {config.DEFAULT_QUANTITY}\n"
        f"⏰ Square-off   : {config.SQUARE_OFF_TIME} IST\n"
        f"🕐 Current Time : {_now_ist()}"
    )
    await update.message.reply_text(text, parse_mode="HTML")


# ── /positions ────────────────────────────────────────────────────────────────

async def cmd_positions(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _authorized(update):
        return await _deny(update)

    if not _angelone or not _angelone._logged_in:
        return await update.message.reply_text("Bot is not logged in to AngelOne.")

    positions = _angelone.get_positions()
    active = [p for p in positions if int(p.get("netqty", 0)) != 0]

    if not active:
        return await update.message.reply_text("No open positions.")

    lines = ["📂 <b>OPEN POSITIONS</b>\n━━━━━━━━━━━━━━━━━━━━"]
    for p in active:
        qty = int(p.get("netqty", 0))
        side = "LONG" if qty > 0 else "SHORT"
        unreal = float(p.get("unrealised", 0))
        pnl_emoji = "📈" if unreal >= 0 else "📉"
        lines.append(
            f"\n📌 <b>{p.get('tradingsymbol')}</b>\n"
            f"   Side : {side} | Qty: {abs(qty)}\n"
            f"   Avg  : ₹{float(p.get('averageprice', 0)):.2f}\n"
            f"   LTP  : ₹{float(p.get('ltp', 0)):.2f}\n"
            f"   {pnl_emoji} P&amp;L : ₹{unreal:.2f}"
        )

    await update.message.reply_text("\n".join(lines), parse_mode="HTML")


# ── /pnl ──────────────────────────────────────────────────────────────────────

async def cmd_pnl(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _authorized(update):
        return await _deny(update)

    if not _angelone or not _angelone._logged_in:
        return await update.message.reply_text("Bot is not logged in.")

    positions = _angelone.get_positions()
    total_realised = sum(float(p.get("realised", 0)) for p in positions)
    total_unrealised = sum(float(p.get("unrealised", 0)) for p in positions)
    total = total_realised + total_unrealised
    pnl_emoji = "📈" if total >= 0 else "📉"

    text = (
        f"{pnl_emoji} <b>TODAY'S P&amp;L</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"✅ Realised   : ₹{total_realised:.2f}\n"
        f"⏳ Unrealised : ₹{total_unrealised:.2f}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"💰 Total      : ₹{total:.2f}\n"
        f"🛡 Loss Limit : ₹{config.MAX_DAILY_LOSS:.2f}\n"
        f"🕐 As of      : {_now_ist()}"
    )
    await update.message.reply_text(text, parse_mode="HTML")


# ── /orders ───────────────────────────────────────────────────────────────────

async def cmd_orders(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _authorized(update):
        return await _deny(update)

    if not _angelone or not _angelone._logged_in:
        return await update.message.reply_text("Bot is not logged in.")

    orders = _angelone.get_order_book()
    if not orders:
        return await update.message.reply_text("No orders today.")

    lines = ["📋 <b>TODAY'S ORDERS</b>\n━━━━━━━━━━━━━━━━━━━━"]
    for o in orders[-10:]:  # last 10
        ostatus = o.get("status", "")
        emoji = {"complete": "✅", "rejected": "❌", "cancelled": "🚫"}.get(
            ostatus.lower(), "⏳"
        )
        lines.append(
            f"\n{emoji} <b>{o.get('tradingsymbol')}</b>\n"
            f"   {o.get('transactiontype')} | {o.get('ordertype')} | Qty: {o.get('quantity')}\n"
            f"   Avg: ₹{float(o.get('averageprice', 0)):.2f} | {ostatus}"
        )

    await update.message.reply_text("\n".join(lines), parse_mode="HTML")


# ── /squareoff ────────────────────────────────────────────────────────────────

async def cmd_squareoff(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _authorized(update):
        return await _deny(update)

    keyboard = [
        [
            InlineKeyboardButton("✅ Yes, close all", callback_data="squareoff_confirm"),
            InlineKeyboardButton("❌ Cancel", callback_data="squareoff_cancel"),
        ]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "⚠️ <b>SQUARE OFF ALL POSITIONS?</b>\nThis will close every open position at market price.",
        parse_mode="HTML",
        reply_markup=reply_markup,
    )


async def cb_squareoff(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if not _authorized(update):
        return

    if query.data == "squareoff_confirm":
        if not _angelone or not _angelone._logged_in:
            return await query.edit_message_text("Bot is not logged in.")
        _trade_manager.square_off_all()
        await query.edit_message_text("✅ Square-off initiated. Check /positions to confirm.")
    else:
        await query.edit_message_text("❌ Square-off cancelled.")


# ── /halt  /resume ────────────────────────────────────────────────────────────

async def cmd_halt(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _authorized(update):
        return await _deny(update)
    if _trade_manager:
        _trade_manager._halted = True
    await update.message.reply_text(
        "🛑 <b>Bot HALTED</b>\nNo new trades will be taken. Use /resume to re-enable.",
        parse_mode="HTML",
    )
    logger.warning("Bot halted via Telegram command")


async def cmd_resume(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _authorized(update):
        return await _deny(update)
    if _trade_manager:
        _trade_manager._halted = False
    await update.message.reply_text(
        "✅ <b>Bot RESUMED</b>\nNow accepting new trade signals.",
        parse_mode="HTML",
    )
    logger.info("Bot resumed via Telegram command")


# ── /setlots ──────────────────────────────────────────────────────────────────

async def cmd_setlots(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _authorized(update):
        return await _deny(update)
    if not context.args:
        return await update.message.reply_text("Usage: /setlots <quantity>\nExample: /setlots 50")
    try:
        qty = int(context.args[0])
        if qty <= 0:
            raise ValueError
        config.DEFAULT_QUANTITY = qty
        await update.message.reply_text(
            f"✅ Default quantity updated to <b>{qty}</b> lots.\nApplies to all new signals.",
            parse_mode="HTML",
        )
        logger.info(f"Default quantity changed to {qty} via Telegram")
    except ValueError:
        await update.message.reply_text("Invalid quantity. Must be a positive integer.")


# ── /setloss ──────────────────────────────────────────────────────────────────

async def cmd_setloss(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _authorized(update):
        return await _deny(update)
    if not context.args:
        return await update.message.reply_text("Usage: /setloss <amount>\nExample: /setloss 8000")
    try:
        amount = float(context.args[0])
        if amount <= 0:
            raise ValueError
        config.MAX_DAILY_LOSS = amount
        if _trade_manager:
            _trade_manager._halted = False  # reset halt if loss limit is raised
        await update.message.reply_text(
            f"✅ Daily loss limit updated to <b>₹{amount:.2f}</b>.",
            parse_mode="HTML",
        )
        logger.info(f"Daily loss limit changed to ₹{amount} via Telegram")
    except ValueError:
        await update.message.reply_text("Invalid amount. Must be a positive number.")


# ── /trade (manual order entry) ───────────────────────────────────────────────

async def cmd_trade(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _authorized(update):
        return await _deny(update)

    usage = (
        "Usage: /trade &lt;SYMBOL&gt; &lt;BUY|SELL&gt; &lt;FUT|CE|PE&gt; &lt;EXPIRY&gt; [STRIKE] [QTY]\n\n"
        "Examples:\n"
        "  /trade NIFTY BUY FUT 29MAY2025\n"
        "  /trade BANKNIFTY SELL PE 29MAY2025 52000\n"
        "  /trade NIFTY BUY CE 29MAY2025 24000 50"
    )

    if not context.args or len(context.args) < 4:
        return await update.message.reply_text(usage, parse_mode="HTML")

    args = context.args
    payload = {
        "secret": config.WEBHOOK_SECRET,
        "symbol": args[0].upper(),
        "action": args[1].upper(),
        "instrument": args[2].upper(),
        "expiry": args[3].upper(),
        "strike": int(args[4]) if len(args) > 4 else 0,
        "quantity": int(args[5]) if len(args) > 5 else config.DEFAULT_QUANTITY,
        "price": 0,
        "product_type": "INTRADAY",
        "order_type": "MARKET",
    }

    signal = processor.parse(payload)
    if not signal:
        return await update.message.reply_text(
            "❌ Invalid trade parameters. Check symbol, expiry format (e.g. 29MAY2025), and strike.",
            parse_mode="HTML",
        )

    # Show confirmation button
    action_emoji = "🟢" if signal.action == "BUY" else "🔴"
    confirm_text = (
        f"{action_emoji} <b>CONFIRM MANUAL TRADE</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"📌 Symbol  : {signal.trading_symbol}\n"
        f"⚡ Action  : {signal.action}\n"
        f"📦 Qty     : {signal.quantity}\n"
        f"📋 Type    : MARKET | INTRADAY"
    )
    keyboard = [[
        InlineKeyboardButton("✅ Execute", callback_data=f"trade_confirm:{signal.trading_symbol}:{signal.action}:{signal.quantity}:{signal.expiry}:{signal.strike}:{signal.instrument}:{signal.symbol}"),
        InlineKeyboardButton("❌ Cancel", callback_data="trade_cancel"),
    ]]
    await update.message.reply_text(
        confirm_text,
        parse_mode="HTML",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def cb_trade(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if not _authorized(update):
        return

    if query.data == "trade_cancel":
        return await query.edit_message_text("❌ Trade cancelled.")

    # parse callback data: trade_confirm:trading_symbol:action:qty:expiry:strike:instrument:symbol
    parts = query.data.split(":")
    if len(parts) < 8:
        return await query.edit_message_text("❌ Invalid trade data.")

    _, trading_symbol, action, qty_str, expiry, strike_str, instrument, symbol = parts

    payload = {
        "secret": config.WEBHOOK_SECRET,
        "symbol": symbol,
        "action": action,
        "instrument": instrument,
        "expiry": expiry,
        "strike": int(strike_str),
        "quantity": int(qty_str),
        "price": 0,
        "product_type": "INTRADAY",
        "order_type": "MARKET",
    }

    signal = processor.parse(payload)
    if not signal:
        return await query.edit_message_text("❌ Signal parse failed.")

    await query.edit_message_text(f"⏳ Placing {action} order for {trading_symbol}...")

    order_id = _trade_manager.process_signal(signal)
    if order_id:
        await context.bot.send_message(
            chat_id=config.TELEGRAM_CHAT_ID,
            text=f"✅ Manual trade placed!\nOrder ID: <code>{order_id}</code>",
            parse_mode="HTML",
        )
    else:
        await context.bot.send_message(
            chat_id=config.TELEGRAM_CHAT_ID,
            text="❌ Trade failed. Check /status for details.",
        )


# ── Unknown command ───────────────────────────────────────────────────────────

async def cmd_unknown(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not _authorized(update):
        return
    await update.message.reply_text("Unknown command. Send /start to see all commands.")


# ── Build Application ─────────────────────────────────────────────────────────

def build_application() -> Application:
    app = Application.builder().token(config.TELEGRAM_BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_start))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("positions", cmd_positions))
    app.add_handler(CommandHandler("pnl", cmd_pnl))
    app.add_handler(CommandHandler("orders", cmd_orders))
    app.add_handler(CommandHandler("squareoff", cmd_squareoff))
    app.add_handler(CommandHandler("halt", cmd_halt))
    app.add_handler(CommandHandler("resume", cmd_resume))
    app.add_handler(CommandHandler("setlots", cmd_setlots))
    app.add_handler(CommandHandler("setloss", cmd_setloss))
    app.add_handler(CommandHandler("trade", cmd_trade))

    app.add_handler(CallbackQueryHandler(cb_squareoff, pattern="^squareoff_"))
    app.add_handler(CallbackQueryHandler(cb_trade, pattern="^trade_"))

    app.add_handler(MessageHandler(filters.COMMAND, cmd_unknown))

    return app
