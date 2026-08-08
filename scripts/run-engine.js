// Markov Engine — CoinGecko API
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL or SUPABASE_KEY not set');
  process.exit(1);
}
console.log('[Engine] CoinGecko scan starting...');

const COINS = [
  { s: 'BTC', id: 'bitcoin', n: 'Bitcoin' },
  { s: 'ETH', id: 'ethereum', n: 'Ethereum' },
  { s: 'SOL', id: 'solana', n: 'Solana' },
  { s: 'SUI', id: 'sui', n: 'Sui' },
  { s: 'LINK', id: 'chainlink', n: 'Chainlink' },
  { s: 'RNDR', id: 'render-token', n: 'Render' },
  { s: 'DOGE', id: 'dogecoin', n: 'Dogecoin' },
  { s: 'PEPE', id: 'pepe', n: 'Pepe' }
];

// Fetch OHLC from CoinGecko (free tier, daily candles)
async function fetchOHLC(id) {
  const url = 'https://api.coingecko.com/api/v3/coins/' + id + '/ohlc?vs_currency=usd&days=30';
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const raw = await res.json();
  return raw.map(function(k) {
    return { t: k[0] / 1000, o: k[1], h: k[2], l: k[3], c: k[4], v: k[4] * 100000 };
  });
}

// EMA
function ema(data, period) {
  var k = 2 / (period + 1);
  var result = [data[0]];
  for (var i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

// RSI
function rsi(closes, period) {
  period = period || 14;
  var result = new Array(closes.length).fill(null);
  var gains = 0, losses = 0;
  for (var i = 1; i <= period; i++) {
    var diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  var avgGain = gains / period;
  var avgLoss = losses / period;
  result[period] = 100 - (100 / (1 + avgGain / (avgLoss || 1)));
  for (var i = period + 1; i < closes.length; i++) {
    var diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    result[i] = 100 - (100 / (1 + avgGain / (avgLoss || 1)));
  }
  return result;
}

// Highest over period
function highest(data, period) {
  var result = [];
  for (var i = 0; i < data.length; i++) {
    var max = -Infinity;
    for (var j = Math.max(0, i - period + 1); j <= i; j++) {
      max = Math.max(max, data[j]);
    }
    result.push(max);
  }
  return result;
}

// ATR
function atr(highs, lows, closes, period) {
  var sum = 0;
  var start = closes.length - period;
  for (var i = start + 1; i < closes.length; i++) {
    var tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    sum += tr;
  }
  return sum / (closes.length - start - 1);
}

// Generate signal
function gen(coin, candles) {
  var closes = candles.map(function(k) { return k.c; });
  var highs = candles.map(function(k) { return k.h; });
  var lows = candles.map(function(k) { return k.l; });
  var volumes = candles.map(function(k) { return k.v; });

  var ema20 = ema(closes, 20);
  var ema50 = ema(closes, 50);
  var rsiVals = rsi(closes, 14);

  var last = closes.length - 1;
  var price = closes[last];

  // Trend
  var trend;
  if (price > ema20[last] && price > ema50[last] && ema20[last] > ema50[last] && ema20[last] > (ema20[last - 3] || ema20[last])) {
    trend = { s: 95, l: 'Strong Uptrend' };
  } else if (price > ema20[last] && price > ema50[last] && ema20[last] > ema50[last]) {
    trend = { s: 80, l: 'Uptrend' };
  } else if (price > ema20[last] && ema20[last] > ema50[last]) {
    trend = { s: 65, l: 'Building' };
  } else if (price > ema50[last]) {
    trend = { s: 45, l: 'Neutral' };
  } else {
    trend = { s: 30, l: 'Weak' };
  }

  // Volume
  var recentVol = volumes.slice(-3);
  var olderVol = volumes.slice(-15, -3);
  var volume;
  if (olderVol.length > 0) {
    var avgRecent = recentVol.reduce(function(s, x) { return s + x; }, 0) / 3;
    var avgOlder = olderVol.reduce(function(s, x) { return s + x; }, 0) / olderVol.length;
    var ratio = avgRecent / avgOlder;
    if (ratio > 2) volume = { s: 88, l: 'Spiking' };
    else if (ratio > 1.5) volume = { s: 75, l: 'Above Avg' };
    else if (ratio > 1) volume = { s: 55, l: 'Normal' };
    else volume = { s: 40, l: 'Below Avg' };
  } else {
    volume = { s: 50, l: 'Normal' };
  }

  // Momentum
  var rsiLast = rsiVals[last];
  var momentum;
  if (rsiLast && rsiLast >= 50 && rsiLast <= 65) momentum = { s: 84, l: 'Bullish' };
  else if (rsiLast && rsiLast > 65 && rsiLast <= 75) momentum = { s: 60, l: 'Strong' };
  else if (rsiLast && rsiLast > 75) momentum = { s: 35, l: 'Overbought' };
  else if (rsiLast && rsiLast >= 40) momentum = { s: 40, l: 'Weak' };
  else momentum = { s: 50, l: 'Neutral' };

  // Breakout
  var hh = highest(highs, 10)[last];
  var breakout;
  if (price > hh && price > closes[last - 3] * 1.03) breakout = { s: 92, l: 'Breakout' };
  else if (price > hh) breakout = { s: 72, l: 'Testing' };
  else if (price > hh * 0.97) breakout = { s: 55, l: 'Near res' };
  else breakout = { s: 30, l: 'Range' };

  // Liquidity
  var avgVol5 = volumes.slice(-5).reduce(function(s, x) { return s + x; }, 0) / 5;
  var liqScore = Math.round(avgVol5 / 10000000 + 40);
  var liquidity = { s: Math.max(30, Math.min(95, liqScore)), l: avgVol5 > 5000000 ? 'Healthy' : 'Thin' };

  // Funding (simulated)
  var rates = { BTC: 0.008, ETH: 0.005, SOL: 0.012, SUI: 0.025, LINK: 0.003, RNDR: 0.006, DOGE: 0.018, PEPE: 0.032 };
  var rate = rates[coin.s] || 0.01;
  var funding;
  if (rate < 0.005) funding = { s: 86, l: 'Neutral' };
  else if (rate < 0.01) funding = { s: 70, l: 'Warm' };
  else if (rate < 0.02) funding = { s: 50, l: 'Hot' };
  else funding = { s: 25, l: 'Extreme' };

  var scores = [trend, volume, momentum, breakout, liquidity, funding];
  var total = 0;
  for (var i = 0; i < scores.length; i++) total += scores[i].s;
  var prob = Math.round(total / 6);

  var grade = 'C';
  if (prob >= 80) grade = 'A';
  else if (prob >= 65) grade = 'B';
  if (grade === 'C') return null;

  var a = atr(highs, lows, closes, 14);
  var rp = Math.min(0.03, (a * 2) / price);

  return {
    id: 'SIG-' + Date.now().toString(36).toUpperCase(),
    coin: coin.s, pair: coin.s + 'USDT', name: coin.n, sector: 'Crypto',
    probability: prob, grade: grade, status: 'active',
    entry_low: +(price * (1 - rp * 0.2)).toFixed(2),
    entry_high: +(price * (1 + rp * 0.2)).toFixed(2),
    tp1: +(price * (1 + rp * 3)).toFixed(2),
    tp2: +(price * (1 + rp * 4)).toFixed(2),
    tp3: +(price * (1 + rp * 5)).toFixed(2),
    stop_loss: +(price * (1 - rp)).toFixed(2),
    risk_pct: +(rp * 100).toFixed(1),
    expected_rr: '1:3', holding_days: '5-7',
    last_price: price, atr: a,
    trend_score: trend.s, volume_score: volume.s, momentum_score: momentum.s,
    breakout_score: breakout.s, liquidity_score: liquidity.s, funding_score: funding.s,
    reasons: '[]', risks: '[]',
    research_summary: coin.s + ' scores ' + prob + '% Grade ' + grade
  };
}

// Save to Supabase
async function postSignal(signal) {
  var url = SUPABASE_URL + '/rest/v1/signals';
  var res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(signal)
  });
  if (!res.ok) {
    var text = await res.text();
    throw new Error('Supabase ' + res.status + ': ' + text.slice(0, 100));
  }
}

// Delay helper
var delay = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };

// Main
async function main() {
  console.log('[Engine] CoinGecko scan at ' + new Date().toISOString());
  var count = 0;
  for (var i = 0; i < COINS.length; i++) {
    var coin = COINS[i];
    try {
      console.log(coin.s + '...');
      var candles = await fetchOHLC(coin.id);
      var signal = gen(coin, candles);
      if (signal) {
        await postSignal(signal);
        console.log(coin.s + ': ' + signal.probability + '% Grade ' + signal.grade + ' OK');
        count++;
      } else {
        console.log(coin.s + ': Grade C — skip');
      }
    } catch (e) {
      console.error(coin.s + ' ERR: ' + e.message);
    }
    await delay(2500);
  }
  console.log('[Engine] Done: ' + count + ' signals saved');
}
main();
