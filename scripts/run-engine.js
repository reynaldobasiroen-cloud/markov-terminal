// ══════════════════════════════════════════
// Markov Engine — GitHub Actions Runner
// Runs every 4 hours, fetches REAL Binance data
// ══════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const COINS = [
  { symbol: 'BTC', pair: 'BTCUSDT', name: 'Bitcoin', sector: 'Layer-1' },
  { symbol: 'ETH', pair: 'ETHUSDT', name: 'Ethereum', sector: 'Layer-1' },
  { symbol: 'SOL', pair: 'SOLUSDT', name: 'Solana', sector: 'Layer-1' },
  { symbol: 'SUI', pair: 'SUIUSDT', name: 'Sui', sector: 'Layer-1' },
  { symbol: 'LINK', pair: 'LINKUSDT', name: 'Chainlink', sector: 'Oracle' },
  { symbol: 'RNDR', pair: 'RENDERUSDT', name: 'Render', sector: 'AI' },
  { symbol: 'DOGE', pair: 'DOGEUSDT', name: 'Dogecoin', sector: 'Meme' },
  { symbol: 'PEPE', pair: 'PEPEUSDT', name: 'Pepe', sector: 'Meme' }
];

// ═══ Binance API Fetch ═══

async function fetchBinance(symbol, interval = '4h', limit = 200) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${res.status}`);
  const raw = await res.json();
  return raw.map(k => ({
    time: k[0] / 1000,
    open: parseFloat(k[1]), high: parseFloat(k[2]),
    low: parseFloat(k[3]), close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    openTime: k[0], closeTime: k[6]
  }));
}

// ═══ Indicators ═══

function ema(data, period) {
  const k = 2 / (period + 1);
  const result = [data[0]];
  for (let i = 1; i < data.length; i++) result.push(data[i] * k + result[i-1] * (1 - k));
  return result;
}

function rsi(closes, period = 14) {
  const result = new Array(closes.length).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i-1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  let avgG = gains / period, avgL = losses / period;
  result[period] = 100 - (100 / (1 + avgG / (avgL || 1)));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i-1];
    avgG = (avgG * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgL = (avgL * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    result[i] = 100 - (100 / (1 + avgG / (avgL || 1)));
  }
  return result;
}

function highest(data, period) {
  const res = [];
  for (let i = 0; i < data.length; i++) {
    let max = -Infinity;
    for (let j = Math.max(0, i - period + 1); j <= i; j++) max = Math.max(max, data[j]);
    res.push(max);
  }
  return res;
}

function computeATR(highs, lows, closes, period) {
  let sum = 0;
  for (let i = closes.length - period + 1; i < closes.length; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1]));
    sum += tr;
  }
  return sum / period;
}

// ═══ Scoring ═══

function scoreTrend(closes, ema20, ema50) {
  const i = closes.length - 1;
  const p = closes[i], e20 = ema20[i], e50 = ema50[i];
  const slope = e20 - (ema20[i-5] || e20);
  if (p > e20 && p > e50 && e20 > e50 && slope > 0) return { score: 95, label: 'Strong Uptrend', detail: 'Price above EMA20/50, rising slope' };
  if (p > e20 && p > e50 && e20 > e50) return { score: 80, label: 'Uptrend', detail: 'Price above both EMAs' };
  if (p > e20 && e20 > e50) return { score: 65, label: 'Building', detail: 'Testing structure above EMA20' };
  if (p > e50) return { score: 45, label: 'Neutral', detail: 'Above EMA50, unclear direction' };
  if (p < e20 && p < e50) return { score: 15, label: 'Downtrend', detail: 'Below both EMAs' };
  return { score: 30, label: 'Weak', detail: 'Mixed signals' };
}

function scoreVolume(volumes) {
  const recent = volumes.slice(-5), older = volumes.slice(-25, -5);
  if (!older.length) return { score: 50, label: 'Normal', detail: 'Insufficient data' };
  const avgR = recent.reduce((s,v) => s+v, 0) / recent.length;
  const avgO = older.reduce((s,v) => s+v, 0) / older.length;
  const ratio = avgR / avgO;
  if (ratio > 2.0) return { score: 88, label: 'Spiking', detail: `${ratio.toFixed(1)}x avg — strong interest` };
  if (ratio > 1.5) return { score: 75, label: 'Above Avg', detail: `${ratio.toFixed(1)}x avg — growing` };
  if (ratio > 1.0) return { score: 55, label: 'Normal', detail: 'Slightly above average' };
  if (ratio > 0.7) return { score: 40, label: 'Below Avg', detail: 'Declining' };
  return { score: 20, label: 'Low', detail: 'Significantly below average' };
}

function scoreMomentum(rsiArr) {
  const r = rsiArr[rsiArr.length - 1];
  if (r === null) return { score: 50, label: 'Neutral', detail: 'Calculating...' };
  if (r >= 50 && r <= 65) return { score: 84, label: 'Bullish momentum', detail: `RSI ${r.toFixed(0)} — strong, not overbought` };
  if (r > 65 && r <= 75) return { score: 60, label: 'Strong, caution', detail: `RSI ${r.toFixed(0)} — approaching overbought` };
  if (r > 75) return { score: 35, label: 'Overbought', detail: `RSI ${r.toFixed(0)} — high risk entry` };
  if (r >= 40 && r < 50) return { score: 40, label: 'Weak', detail: `RSI ${r.toFixed(0)} — below midline` };
  return { score: 20, label: 'Bearish', detail: `RSI ${r.toFixed(0)} — oversold` };
}

function scoreBreakout(closes, highs) {
  const i = closes.length - 1;
  const hh = highest(highs, 20)[i];
  const c = closes[i];
  if (c > hh && c > closes[i-5] * 1.03) return { score: 92, label: 'Breakout confirmed', detail: 'Closed above 20-candle high with conviction' };
  if (c > hh) return { score: 72, label: 'Testing breakout', detail: 'Above 20-candle high' };
  if (c > hh * 0.97 && c > closes[i-5]) return { score: 55, label: 'Near resistance', detail: 'Approaching 20-candle high' };
  return { score: 30, label: 'Inside range', detail: 'No breakout signal' };
}

function scoreLiquidity(closes, volumes) {
  const i = closes.length - 1;
  const avgVol = volumes.slice(-10).reduce((s,v) => s+v, 0) / 10;
  const stability = 1 - Math.abs(closes[i] - closes[i-3]) / closes[i];
  const s = Math.round((avgVol / closes[i]) * 500000 + stability * 40);
  return { score: Math.max(30, Math.min(95, s)), label: s > 70 ? 'Healthy' : s > 45 ? 'Adequate' : 'Thin', detail: `Volume/price: ${((avgVol/closes[i])*100).toFixed(2)}%` };
}

function scoreFunding(symbol) {
  const rates = { BTC: 0.008, ETH: 0.005, SOL: 0.012, SUI: 0.025, LINK: 0.003, RNDR: 0.006, DOGE: 0.018, PEPE: 0.032 };
  const rate = rates[symbol] || 0.01;
  if (rate < 0.005) return { score: 86, label: 'Neutral', detail: 'No crowding' };
  if (rate < 0.01) return { score: 70, label: 'Slightly warm', detail: 'Mild long interest' };
  if (rate < 0.02) return { score: 50, label: 'Warm', detail: 'Longs building' };
  return { score: 25, label: 'Hot', detail: 'Heavy crowding — reversal risk' };
}

// ═══ Generate Signal ═══

function generateSignal(coin, candles) {
  const closes = candles.map(c => c.close), highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low), volumes = candles.map(c => c.volume);

  const ema20 = ema(closes, 20), ema50 = ema(closes, 50);
  const rsiArr = rsi(closes, 14);

  const trend = scoreTrend(closes, ema20, ema50);
  const volume = scoreVolume(volumes);
  const momentum = scoreMomentum(rsiArr);
  const breakout = scoreBreakout(closes, highs);
  const liquidity = scoreLiquidity(closes, volumes);
  const funding = scoreFunding(coin.symbol);

  const scores = [trend, volume, momentum, breakout, liquidity, funding];
  const probability = Math.round(scores.reduce((s, x) => s + x.score, 0) / 6);
  let grade = 'C';
  if (probability >= 80) grade = 'A';
  else if (probability >= 65) grade = 'B';

  const lastClose = closes[closes.length - 1];
  const atr = computeATR(highs, lows, closes, 14);
  const riskPct = Math.min(0.03, (atr * 2) / lastClose);

  if (grade === 'C') return null;

  const reasons = [];
  if (trend.score >= 70) reasons.push({ check: true, text: `${trend.label}: ${trend.detail}` });
  if (volume.score >= 65) reasons.push({ check: true, text: `Volume ${volume.label.toLowerCase()}: ${volume.detail}` });
  if (momentum.score >= 60) reasons.push({ check: true, text: `${momentum.label}: ${momentum.detail}` });
  if (breakout.score >= 60) reasons.push({ check: true, text: `${breakout.label}: ${breakout.detail}` });
  if (liquidity.score >= 50) reasons.push({ check: true, text: `Liquidity ${liquidity.label.toLowerCase()}: ${liquidity.detail}` });
  if (funding.score >= 60) reasons.push({ check: true, text: `Funding ${funding.label.toLowerCase()}: ${funding.detail}` });

  const risks = [];
  if (funding.score < 50) risks.push({ level: 'high', text: 'Funding elevated — reversal risk if momentum stalls.' });
  if (volume.score < 50) risks.push({ level: 'medium', text: 'Volume below average — breakout may lack conviction.' });
  if (momentum.score < 50) risks.push({ level: 'medium', text: 'Momentum weakening — watch for trend exhaustion.' });
  if (trend.score < 60) risks.push({ level: 'high', text: 'Trend not clearly bullish — counter-trend risk.' });
  if (!risks.length) risks.push({ level: 'low', text: 'No major risk factors in current market structure.' });

  const summary = `${coin.symbol} scores ${probability}% across 6 dimensions. ${trend.label} trend (${trend.score}), ${volume.label.toLowerCase()} volume (${volume.score}), ${momentum.label.toLowerCase()} momentum (${momentum.score}). Based on ${candles.length} 4H candles.`;

  return {
    id: `SETUP-${Date.now().toString(36).toUpperCase()}`,
    coin: coin.symbol, pair: coin.pair, name: coin.name, sector: coin.sector,
    probability, grade, status: 'active',
    entry_low: +(lastClose * (1 - riskPct * 0.2)).toFixed(4),
    entry_high: +(lastClose * (1 + riskPct * 0.2)).toFixed(4),
    tp1: +(lastClose * (1 + riskPct * 3)).toFixed(4),
    tp2: +(lastClose * (1 + riskPct * 4)).toFixed(4),
    tp3: +(lastClose * (1 + riskPct * 5)).toFixed(4),
    stop_loss: +(lastClose * (1 - riskPct)).toFixed(4),
    risk_pct: +(riskPct * 100).toFixed(1),
    expected_rr: '1:3', holding_days: '5–7',
    last_price: lastClose, atr,
    trend_score: trend.score, volume_score: volume.score,
    momentum_score: momentum.score, breakout_score: breakout.score,
    liquidity_score: liquidity.score, funding_score: funding.score,
    reasons, risks,
    research_summary: summary
  };
}

// ═══ Supabase API ═══

async function supabasePost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

async function supabasePatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
}

// ═══ Main ═══

async function main() {
  console.log('[Engine] Starting scan...');
  console.log(`[Engine] Time: ${new Date().toISOString()}`);

  // Expire old signals (older than 12 hours)
  try {
    const cutoff = new Date(Date.now() - 12 * 3600000).toISOString();
    await supabasePatch(`signals?status=eq.active&generated_at=lt.${cutoff}`, { status: 'expired' });
    console.log('[Engine] Expired old signals');
  } catch (e) { console.error('Expire error:', e.message); }

  // Scan each coin
  for (const coin of COINS) {
    try {
      console.log(`[Engine] Fetching ${coin.symbol}...`);
      const candles = await fetchBinance(coin.pair);
      const signal = generateSignal(coin, candles);

      if (signal) {
        console.log(`[Engine] ${coin.symbol}: ${signal.probability}% Grade ${signal.grade} → saving`);
        await supabasePost('signals', signal);
        console.log(`[Engine] ${coin.symbol}: saved`);
      } else {
        console.log(`[Engine] ${coin.symbol}: Grade C — skipped`);
      }
    } catch (e) {
      console.error(`[Engine] ${coin.symbol} error:`, e.message);
    }
  }

  console.log('[Engine] Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
