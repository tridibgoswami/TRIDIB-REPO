"""
FastAPI webhook server that receives TradingView alerts.

TradingView alert URL: http://<your-server-ip>:8000/webhook
"""

from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse
from loguru import logger

from config import config
from signal_processor import processor
from trade_manager import trade_manager

app = FastAPI(title="TradingView-AngelOne Bot", version="1.0.0")


@app.get("/health")
async def health():
    return {
        "status": "running",
        "halted": trade_manager.is_halted,
        "open_positions": trade_manager.open_position_count,
    }


@app.post("/webhook")
async def webhook(request: Request):
    payload = await request.json()
    logger.info(f"Webhook received: {payload}")

    # 1. Validate secret
    if not processor.validate_secret(payload):
        logger.warning("Invalid webhook secret — rejecting")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook secret",
        )

    # 2. Parse signal
    signal = processor.parse(payload)
    if signal is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Signal validation failed — check logs",
        )

    # 3. Execute trade (non-blocking — returns order_id or None)
    order_id = trade_manager.process_signal(signal)

    if order_id:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "order_placed", "order_id": order_id},
        )
    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"status": "signal_rejected", "reason": "See Telegram / logs for details"},
    )
