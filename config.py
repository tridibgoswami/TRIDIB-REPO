import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # AngelOne
    ANGELONE_API_KEY: str = os.environ["ANGELONE_API_KEY"]
    ANGELONE_CLIENT_ID: str = os.environ["ANGELONE_CLIENT_ID"]
    ANGELONE_PASSWORD: str = os.environ["ANGELONE_PASSWORD"]
    ANGELONE_TOTP_SECRET: str = os.environ["ANGELONE_TOTP_SECRET"]

    # Telegram
    TELEGRAM_BOT_TOKEN: str = os.environ["TELEGRAM_BOT_TOKEN"]
    TELEGRAM_CHAT_ID: str = os.environ["TELEGRAM_CHAT_ID"]

    # Webhook
    WEBHOOK_SECRET: str = os.environ["WEBHOOK_SECRET"]
    WEBHOOK_HOST: str = os.getenv("WEBHOOK_HOST", "0.0.0.0")
    WEBHOOK_PORT: int = int(os.getenv("WEBHOOK_PORT", "8000"))

    # Risk
    MAX_DAILY_LOSS: float = float(os.getenv("MAX_DAILY_LOSS", "5000"))
    MAX_OPEN_POSITIONS: int = int(os.getenv("MAX_OPEN_POSITIONS", "2"))
    DEFAULT_QUANTITY: int = int(os.getenv("DEFAULT_QUANTITY", "25"))
    SQUARE_OFF_TIME: str = os.getenv("SQUARE_OFF_TIME", "15:15")

    # Lot sizes for reference
    LOT_SIZES: dict = {
        "NIFTY": 25,
        "BANKNIFTY": 15,
        "FINNIFTY": 40,
        "MIDCPNIFTY": 75,
    }

    # Market hours IST
    MARKET_OPEN: str = "09:15"
    MARKET_CLOSE: str = "15:30"
    BOT_START: str = "09:00"


config = Config()
