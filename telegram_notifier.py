import asyncio
from datetime import datetime
import pytz
from telegram import Bot
from telegram.error import TelegramError
from loguru import logger
from config import config

IST = pytz.timezone("Asia/Kolkata")


class TelegramNotifier:
    def __init__(self):
        self.bot = Bot(token=config.TELEGRAM_BOT_TOKEN)
        self.chat_id = config.TELEGRAM_CHAT_ID

    def _now_ist(self) -> str:
        return datetime.now(IST).strftime("%d-%b-%Y %I:%M:%S %p")

    async def _send(self, text: str):
        try:
            await self.bot.send_message(
                chat_id=self.chat_id,
                text=text,
                parse_mode="HTML",
            )
        except TelegramError as e:
            logger.error(f"Telegram send failed: {e}")

    def send(self, text: str):
        asyncio.run(self._send(text))

    # ── Notification templates ────────────────────────────────────────────────

    def signal_received(self, signal: dict):
        emoji = "🟢" if signal["action"] == "BUY" else "🔴"
        msg = (
            f"{emoji} <b>SIGNAL RECEIVED</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"📌 Symbol   : <b>{signal['symbol']}</b>\n"
            f"⚡ Action   : <b>{signal['action']}</b>\n"
            f"💰 Price    : ₹{signal.get('price', 'MARKET')}\n"
            f"📦 Qty      : {signal.get('quantity', config.DEFAULT_QUANTITY)}\n"
            f"🕐 Time     : {self._now_ist()}"
        )
        self.send(msg)

    def order_placed(self, order_id: str, signal: dict, order_details: dict):
        emoji = "✅"
        msg = (
            f"{emoji} <b>ORDER PLACED</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"🆔 Order ID : <code>{order_id}</code>\n"
            f"📌 Symbol   : <b>{signal['symbol']}</b>\n"
            f"⚡ Action   : <b>{signal['action']}</b>\n"
            f"💰 Price    : ₹{order_details.get('price', 'MARKET')}\n"
            f"📦 Qty      : {order_details.get('quantity')}\n"
            f"📋 Type     : {order_details.get('ordertype')}\n"
            f"🕐 Time     : {self._now_ist()}"
        )
        self.send(msg)

    def order_rejected(self, signal: dict, reason: str):
        msg = (
            f"❌ <b>ORDER REJECTED</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"📌 Symbol   : <b>{signal['symbol']}</b>\n"
            f"⚡ Action   : <b>{signal['action']}</b>\n"
            f"⚠️ Reason   : {reason}\n"
            f"🕐 Time     : {self._now_ist()}"
        )
        self.send(msg)

    def order_filled(self, order_id: str, fill_price: float, quantity: int):
        msg = (
            f"✅ <b>ORDER EXECUTED</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"🆔 Order ID : <code>{order_id}</code>\n"
            f"💰 Fill Price: ₹{fill_price}\n"
            f"📦 Qty      : {quantity}\n"
            f"🕐 Time     : {self._now_ist()}"
        )
        self.send(msg)

    def square_off_alert(self, positions: list):
        msg = (
            f"⏰ <b>AUTO SQUARE-OFF INITIATED</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"📋 Positions: {len(positions)}\n"
            f"🕐 Time     : {self._now_ist()}\n"
            f"ℹ️ Closing all open positions before market close."
        )
        self.send(msg)

    def daily_loss_halt(self, loss: float):
        msg = (
            f"🚨 <b>DAILY LOSS LIMIT HIT — BOT HALTED</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"💸 Loss     : ₹{loss:.2f}\n"
            f"🛑 Limit    : ₹{config.MAX_DAILY_LOSS:.2f}\n"
            f"🕐 Time     : {self._now_ist()}\n"
            f"⚠️ No more trades will be taken today."
        )
        self.send(msg)

    def bot_started(self):
        msg = (
            f"🚀 <b>TRADING BOT STARTED</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"📅 Date     : {self._now_ist()}\n"
            f"⏰ Hours    : 09:00 AM – 03:30 PM IST\n"
            f"🛡 Max Loss : ₹{config.MAX_DAILY_LOSS}\n"
            f"📊 Max Pos  : {config.MAX_OPEN_POSITIONS}\n"
            f"✅ Watching for TradingView signals..."
        )
        self.send(msg)

    def bot_stopped(self, pnl: float = 0.0):
        emoji = "🟢" if pnl >= 0 else "🔴"
        msg = (
            f"🔴 <b>TRADING BOT STOPPED</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"{emoji} Day P&L  : ₹{pnl:.2f}\n"
            f"🕐 Time     : {self._now_ist()}\n"
            f"✅ Session complete. See you tomorrow!"
        )
        self.send(msg)

    def error_alert(self, error: str):
        msg = (
            f"⚠️ <b>BOT ERROR</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"❌ {error}\n"
            f"🕐 Time     : {self._now_ist()}"
        )
        self.send(msg)


notifier = TelegramNotifier()
