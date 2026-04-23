/**
 * Cloudflare Worker — TradingView Signal Relay
 *
 * Receives TradingView webhook → validates secret → pushes Expo notification to your phone.
 *
 * Deploy:
 *   npm install -g wrangler
 *   wrangler login
 *   wrangler secret put WEBHOOK_SECRET     ← your chosen secret
 *   wrangler secret put EXPO_PUSH_TOKEN    ← token shown in app Settings screen
 *   wrangler deploy
 *
 * TradingView Webhook URL: https://tradingview-signal-relay.<your-subdomain>.workers.dev/signal
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({ status: 'ok' });
    }

    if (url.pathname !== '/signal' || request.method !== 'POST') {
      return new Response('Not found', { status: 404 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Validate webhook secret
    if (body.secret !== env.WEBHOOK_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { symbol, action, instrument, expiry, strike, quantity, price, order_type, product_type } = body;

    // Build a human-readable notification title
    const actionEmoji = action === 'BUY' ? '🟢' : '🔴';
    const inst = instrument === 'FUT' ? 'Futures' : `${strike} ${instrument}`;
    const title = `${actionEmoji} ${action} ${symbol} ${inst}`;
    const body_text = `${quantity} lots • ${order_type ?? 'MARKET'} • ${product_type ?? 'INTRADAY'} • ${expiry}`;

    // Send Expo push notification
    const pushPayload = {
      to: env.EXPO_PUSH_TOKEN,
      sound: 'default',
      priority: 'high',
      title,
      body: body_text,
      data: { symbol, action, instrument, expiry, strike, quantity, price, order_type, product_type },
      channelId: 'signals',
    };

    const pushResp = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(pushPayload),
    });

    const pushResult = await pushResp.json();
    const success = pushResult?.data?.status === 'ok';

    return Response.json({
      relayed: success,
      signal: { symbol, action, instrument, expiry },
      push: pushResult?.data,
    });
  },
};
