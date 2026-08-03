// ─── Coin definitions (Binance symbols for real API, no BINANCE: prefix) ───
const coins = [
  { symbol: 'BTC', pair: 'BTCUSDT', title: 'BTCUSDT', name: 'Bitcoin', probability: 62, trend: 'Bullish', momentum: '+1.2%', risk: 'Medium', markov: 72, volume: 68, funding: 'Warm', thesis: 'Structure is intact, but leverage is rising faster than spot volume.' },
  { symbol: 'ETH', pair: 'ETHUSDT', title: 'ETHUSDT', name: 'Ethereum', probability: 58, trend: 'Neutral', momentum: '+0.8%', risk: 'Low', markov: 66, volume: 61, funding: 'Normal', thesis: 'ETH is lagging BTC. Better as confirmation asset than lead trade today.' },
  { symbol: 'SOL', pair: 'SOLUSDT', title: 'SOLUSDT', name: 'Solana', probability: 74, trend: 'Strong', momentum: '+6.8%', risk: 'Medium', markov: 82, volume: 78, funding: 'Warm', thesis: 'Outperforms when BTC reclaims range with rising volume.' },
  { symbol: 'SUI', pair: 'SUIUSDT', title: 'SUIUSDT', name: 'Sui', probability: 82, trend: 'Hot', momentum: '+9.1%', risk: 'High', markov: 88, volume: 84, funding: 'Hot', thesis: 'Strongest relative move, but funding is getting crowded.' },
  { symbol: 'LINK', pair: 'LINKUSDT', title: 'LINKUSDT', name: 'Chainlink', probability: 68, trend: 'Building', momentum: '+3.4%', risk: 'Low', markov: 76, volume: 72, funding: 'Normal', thesis: 'Clean structure. Better if ETH confirms strength.' },
  { symbol: 'RNDR', pair: 'RENDERUSDT', title: 'RENDERUSDT', name: 'Render', probability: 71, trend: 'Strong', momentum: '+5.2%', risk: 'Medium', markov: 79, volume: 75, funding: 'Normal', thesis: 'AI sector bid is returning with healthier volume.' },
  { symbol: 'DOGE', pair: 'DOGEUSDT', title: 'DOGEUSDT', name: 'Dogecoin', probability: 54, trend: 'Choppy', momentum: '-0.7%', risk: 'High', markov: 59, volume: 48, funding: 'Warm', thesis: 'Meme liquidity is thinner. Only trade after clean reclaim.' },
  { symbol: 'PEPE', pair: 'PEPEUSDT', title: 'PEPEUSDT', name: 'Pepe', probability: 47, trend: 'Weak', momentum: '-4.1%', risk: 'High', markov: 51, volume: 44, funding: 'Warm', thesis: 'Avoid today. Your journal shows meme trades trigger FOMO entries.' }
];

const pulse = [
  ['BTC trend', 'Bullish', '4H higher high', 'green'],
  ['ETH trend', 'Neutral', 'Still lagging', 'yellow'],
  ['Funding', 'Warm', 'Longs crowding', 'yellow'],
  ['Open interest', 'Rising', '+11% today', 'yellow'],
  ['Volatility', 'High', 'ATR +18%', 'red'],
  ['Liquidity', 'Healthy', 'Depth improving', 'green']
];

const sheetTemplates = {
  alertsSheet: { icon: 'notifications', title: 'Three alerts need attention', body: 'I filtered the noisy ones. These are the only alerts that can change your next decision.', rows: [['BTC range high touched', 'Wait 4H close'], ['SUI Markov probability', '82%'], ['Funding on SOL', 'Getting warm']], action: 'Review alerts' },
  regimeSheet: { icon: 'psychology', title: 'Sideways, but not sleepy', body: 'BTC is holding structure, but leverage is rising faster than spot volume. This makes late breakouts fragile.', rows: [['Best action', 'Wait'], ['Position size', 'Half'], ['Avoid', 'Impulse breakouts']], action: 'Open scanner carefully' },
  pulseSheet: { icon: 'monitoring', title: 'Market Pulse explained', body: 'The pulse converts many signals into decision colors. Green means supportive. Yellow means check twice. Red means reduce risk.', rows: [['BTC trend', 'Green'], ['Funding', 'Yellow'], ['Volatility', 'Red'], ['Liquidity', 'Green']], action: 'Got it' },
  filterSheet: { icon: 'tune', title: 'Scanner filters', body: 'This prototype uses decision-first filters. The goal is not more signals. The goal is fewer bad trades.', rows: [['Trend', '4H uptrend'], ['Volume', 'Above 20D average'], ['Funding', 'Not extreme'], ['Risk', 'No late chase']], action: 'Apply filters' },
  patternSheet: { icon: 'fingerprint', title: 'Your decision pattern', body: 'The moat is here: market data plus your human decision context. I can now see which setups fit you.', rows: [['Losses in sideways market', '80%'], ['Winrate with volume confirm', '+24%'], ['After 2 wins', 'Overtrade risk']], action: 'Show Trading DNA' },
  tradeReviewSheet: { icon: 'rate_review', title: 'AI trade review', body: 'Good trades are not just winners. I score decision quality separately from PnL.', rows: [['Thesis quality', 'Good'], ['Entry location', 'Clean'], ['Emotional risk', 'Low'], ['Lesson', 'Repeat confirmation rule']], action: 'Save lesson' },
  dnaSheet: { icon: 'fingerprint', title: 'Your Trading DNA', body: 'You are not a prediction trader. You do best when momentum is already proven and risk is predefined.', rows: [['Strength', 'Patience'], ['Weakness', 'FOMO after wins'], ['Best timeframe', '4H'], ['Worst setup', '15m chop']], action: 'View full report' }
};

// ─── State ───
let activeCoin = coins[0];
let currentInterval = '1h';          // Binance format
let currentIntervalLabel = '1H';     // UI label
let mainChart = null;
let mainSeries = null;
let miniChartInst = null;
let miniSeries = null;
let researchChartInst = null;
let rawKlineData = [];               // full raw data from Binance
let refreshTimer = null;

const BINANCE_BASE = 'https://api.binance.com/api/v3/klines';
const INTERVAL_MAP = { '1H': '1h', '4H': '4h', '1D': '1d', '1W': '1w' };
const LIMIT = 200;

// ─── Init ───
async function init() {
  renderPulse();
  renderWatchlist();
  renderCoinTabs();
  renderScanner('Momentum');
  renderChartStats();
  bindNavigation();
  bindSheets();
  bindFilters();
  bindCoach();
  bindTimeframes();
  bindRawDataButtons();
  // Fetch real data for both charts
  loadChartData(activeCoin.pair, currentInterval, 'main');
  loadChartData('BTCUSDT', '1h', 'mini');
  startAutoRefresh();
  // Load DB stats after DB is ready
  setTimeout(refreshDashboardStats, 500);
}

// ══════════════════════════════════════════
// MULTI-SOURCE OHLCV FETCH — CORS proxy → direct → fallbacks
// ══════════════════════════════════════════

// CORS proxies to try (ordered by reliability)
const CORS_PROXIES = [
  'https://corsproxy.io/?',           // adds CORS headers
  'https://api.allorigins.win/raw?url=',
];

// Try Binance with CORS proxy first, then direct, then CoinGecko, then Bybit
async function fetchKlinesMulti(symbol, interval, limit = LIMIT) {
  const errors = [];

  // Strategy 1: Binance via CORS proxy
  for (const proxy of CORS_PROXIES) {
    try {
      const url = `${proxy}${encodeURIComponent(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)}`;
      const data = await tryBinanceFetch(url);
      if (data) { updateSourceLabel('Binance API (via proxy)'); return data; }
    } catch (e) { errors.push(`proxy: ${e.message}`); }
  }

  // Strategy 2: Binance direct (works if CORS is not the issue)
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const data = await tryBinanceFetch(url);
    if (data) { updateSourceLabel('Binance API (direct)'); return data; }
  } catch (e) { errors.push(`binance-direct: ${e.message}`); }

  // Strategy 3: Bybit API (different domain, often unblocked)
  try {
    const data = await fetchBybitKlines(symbol, interval, limit);
    if (data) { updateSourceLabel('Bybit API'); return data; }
  } catch (e) { errors.push(`bybit: ${e.message}`); }

  // Strategy 4: CoinGecko (limited — daily candles only for free tier)
  try {
    const data = await fetchCoinGeckoKlines(symbol, limit);
    if (data) { updateSourceLabel('CoinGecko API (daily)'); return data; }
  } catch (e) { errors.push(`coingecko: ${e.message}`); }

  // Strategy 5: Simulated data — structurally identical to Binance response
  console.warn('All APIs failed:', errors.join(' | '));
  updateSourceLabel('SIMULATED — all APIs unreachable');
  return generateSimulatedKlines(symbol, interval, limit);
}

async function tryBinanceFetch(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Empty response');
  return raw.map(k => ({
    time: k[0] / 1000,
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    openTime: k[0],
    closeTime: k[6],
    quoteVolume: parseFloat(k[7]),
    trades: k[8],
    takerBuyBase: parseFloat(k[9]),
    takerBuyQuote: parseFloat(k[10])
  }));
}

async function fetchBybitKlines(symbol, interval, limit) {
  const bybitInterval = { '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' }[interval] || '60';
  const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${bybitInterval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.retCode !== 0 || !json.result?.list) throw new Error('Bybit error');
  // Bybit returns newest first; we reverse to chronological
  return json.result.list.reverse().map(k => {
    const t = parseInt(k[0]);
    return {
      time: t / 1000,
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      openTime: t,
      closeTime: t + 3600000,
      quoteVolume: parseFloat(k[6] || 0),
      trades: 0,
      takerBuyBase: 0,
      takerBuyQuote: 0
    };
  });
}

async function fetchCoinGeckoKlines(symbol, limit) {
  const coinMap = { 'BTCUSDT': 'bitcoin', 'ETHUSDT': 'ethereum', 'SOLUSDT': 'solana', 'SUIUSDT': 'sui',
    'LINKUSDT': 'chainlink', 'RENDERUSDT': 'render-token', 'DOGEUSDT': 'dogecoin', 'PEPEUSDT': 'pepe' };
  const coinId = coinMap[symbol];
  if (!coinId) throw new Error('Unsupported coin');
  const days = Math.min(Math.ceil(limit / 24), 90);
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error('Invalid response');
  return raw.slice(-limit).map(k => ({
    time: k[0] / 1000,
    open: k[1],
    high: k[2],
    low: k[3],
    close: k[4],
    volume: 0,
    openTime: k[0],
    closeTime: k[0] + 86400000,
    quoteVolume: 0,
    trades: 0,
    takerBuyBase: 0,
    takerBuyQuote: 0
  }));
}

// Simulated data — identical structure, labeled clearly in UI
function generateSimulatedKlines(symbol, interval, limit) {
  const intervalMs = { '1h': 3600000, '4h': 14400000, '1d': 86400000, '1w': 604800000 }[interval] || 3600000;
  const basePrices = { 'BTCUSDT': 68000, 'ETHUSDT': 3400, 'SOLUSDT': 180, 'SUIUSDT': 3.5, 'LINKUSDT': 18, 'RENDERUSDT': 8, 'DOGEUSDT': 0.12, 'PEPEUSDT': 0.000008 };
  const now = Date.now();
  const data = [];
  let price = basePrices[symbol] || 100;
  for (let i = limit; i >= 0; i--) {
    const t = now - i * intervalMs;
    const change = (Math.random() - 0.5) * price * 0.02;
    const open = price;
    const close = open + change;
    const high = Math.max(open, close) * (1 + Math.random() * 0.008);
    const low = Math.min(open, close) * (1 - Math.random() * 0.008);
    const volume = price * (100 + Math.random() * 900);
    data.push({ time: t / 1000, open, high, low, close, volume, openTime: t, closeTime: t + intervalMs, quoteVolume: volume * close, trades: Math.floor(Math.random() * 500), takerBuyBase: volume * (Math.random() * 0.6), takerBuyQuote: volume * close * (Math.random() * 0.6) });
    price = close;
  }
  return data;
}

async function loadChartData(symbol, interval, target) {
  try {
    const data = await fetchKlinesMulti(symbol, interval);
    if (target === 'main') {
      rawKlineData = data;
      renderMainChart(data);
      renderPriceBar(data);
      renderRawDataTable(data);
      updateChartStatsFromData(data);
      // Save to IndexedDB (fire-and-forget)
      saveMarketData(symbol, interval, data).then(n => {
        if (n > 0) console.log(`DB: saved ${n} new candles for ${symbol} ${interval}`);
      }).catch(() => {});
    } else if (target === 'mini') {
      renderMiniChart(data);
    }
  } catch (err) {
    console.error(`Failed to load ${symbol} ${interval}:`, err);
    if (target === 'main') {
      const priceBar = document.getElementById('livePriceBar');
      if (priceBar) priceBar.innerHTML = '<span class="price-loading" style="color:var(--red)">All data sources unreachable. Check your internet connection.</span>';
      const rawBody = document.getElementById('rawDataBody');
      if (rawBody) rawBody.innerHTML = '<tr><td colspan="9" class="loading-cell" style="color:var(--red)">All APIs failed. Open DevTools console for details.</td></tr>';
    }
  }
}

// ══════════════════════════════════════════
// PURE CANVAS CANDLESTICK CHART — ZERO DEPENDENCIES
// ══════════════════════════════════════════

class CanvasChart {
  constructor(containerId, mini = false) {
    this.container = document.getElementById(containerId);
    this.mini = mini;
    this.data = [];
    this.offset = 0;          // scroll offset from end
    this.visibleCount = 60;   // candles visible
    this.candleW = 0;
    this.padding = { top: 20, right: 60, bottom: 30, left: 10 };

    // Build canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // Interaction state
    this.crossX = -1;
    this.dragging = false;
    this.dragStart = 0;
    this.dragOffsetStart = 0;

    this._bindEvents();
    this._resize();
    this._raf = requestAnimationFrame(() => this._draw());

    // ResizeObserver
    if (window.ResizeObserver) {
      new ResizeObserver(() => this._resize()).observe(this.container);
    }
  }

  _resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.candleW = (this.w - this.padding.left - this.padding.right) / this.visibleCount;
  }

  setData(data) {
    this.data = data;
    this.offset = 0;
    this._draw();
  }

  _bindEvents() {
    this.canvas.addEventListener('mousemove', e => {
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      this.crossX = mx;
      if (this.dragging) {
        const dx = mx - this.dragStart;
        this.offset = Math.max(0, Math.min(this.data.length - this.visibleCount, this.dragOffsetStart - Math.round(dx / this.candleW)));
      }
      this._draw();
    });
    this.canvas.addEventListener('mouseleave', () => { this.crossX = -1; this._draw(); });
    this.canvas.addEventListener('mousedown', e => {
      if (this.mini) return;
      this.dragging = true;
      this.dragStart = e.clientX - this.canvas.getBoundingClientRect().left;
      this.dragOffsetStart = this.offset;
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    this.canvas.addEventListener('wheel', e => {
      if (this.mini) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 10 : -10;
      this.visibleCount = Math.max(10, Math.min(200, this.visibleCount + delta));
      this.candleW = (this.w - this.padding.left - this.padding.right) / this.visibleCount;
      this.offset = Math.max(0, Math.min(this.data.length - this.visibleCount, this.offset));
      this._draw();
    });
  }

  _draw() {
    const { ctx, w, h, data, padding, candleW, visibleCount, offset, mini } = this;
    ctx.clearRect(0, 0, w, h);

    if (!data.length) {
      ctx.fillStyle = '#9aa5b8';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Loading data...', w / 2, h / 2);
      return;
    }

    const start = Math.max(0, data.length - visibleCount - offset);
    const end = Math.min(data.length, start + visibleCount);
    const visible = data.slice(start, end);

    // Compute price range
    let minP = Infinity, maxP = -Infinity;
    for (const d of visible) {
      if (d.low < minP) minP = d.low;
      if (d.high > maxP) maxP = d.high;
    }
    const range = maxP - minP || 1;
    const chartH = h - padding.top - padding.bottom;
    const chartW = w - padding.left - padding.right;
    const toY = (p) => padding.top + chartH * (1 - (p - minP) / range);
    const toX = (i) => padding.left + (i - start) * candleW + candleW / 2;

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = padding.top + (chartH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      // Price labels
      const price = maxP - (range * i) / 4;
      ctx.fillStyle = '#667086';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(this._fmt(price), w - 4, y + 4);
    }

    // Time labels (bottom)
    const timeStep = Math.max(1, Math.floor(visible.length / 5));
    for (let i = 0; i < visible.length; i += timeStep) {
      const x = toX(i);
      ctx.fillStyle = '#667086';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this._timeFmt(visible[i].time, mini), x, h - 6);
    }

    // Volume bars (bottom 20%)
    const volH = chartH * 0.15;
    const priceTop = padding.top;
    const priceBot = h - padding.bottom - volH;
    let maxVol = 0;
    for (const d of visible) { if (d.volume > maxVol) maxVol = d.volume; }
    for (let i = 0; i < visible.length; i++) {
      const d = visible[i];
      const x = toX(i);
      const bw = Math.max(1, candleW * 0.7);
      const vh = maxVol ? (d.volume / maxVol) * volH : 0;
      ctx.fillStyle = d.close >= d.open ? 'rgba(72,213,151,0.3)' : 'rgba(255,111,125,0.3)';
      ctx.fillRect(x - bw / 2, h - padding.bottom - vh, bw, vh);
    }

    // Candles
    for (let i = 0; i < visible.length; i++) {
      const d = visible[i];
      const x = toX(i);
      const bw = Math.max(1, candleW * 0.7);
      const isUp = d.close >= d.open;
      const bodyTop = toY(Math.max(d.open, d.close));
      const bodyBot = toY(Math.min(d.open, d.close));
      const bodyH = Math.max(1, bodyBot - bodyTop);
      const wickTop = toY(d.high);
      const wickBot = toY(d.low);

      ctx.strokeStyle = isUp ? '#48d597' : '#ff6f7d';
      ctx.fillStyle = isUp ? '#48d597' : '#ff6f7d';
      ctx.lineWidth = 1;

      // Wick
      ctx.beginPath();
      ctx.moveTo(x, wickTop);
      ctx.lineTo(x, wickBot);
      ctx.stroke();

      // Body
      if (bodyH < 1.5) {
        ctx.strokeStyle = isUp ? '#48d597' : '#ff6f7d';
        ctx.beginPath();
        ctx.moveTo(x - bw / 2, bodyTop);
        ctx.lineTo(x + bw / 2, bodyTop);
        ctx.stroke();
      } else {
        ctx.fillRect(x - bw / 2, bodyTop, bw, bodyH);
      }
    }

    // Crosshair
    if (this.crossX > padding.left && this.crossX < w - padding.right) {
      const idx = start + Math.floor((this.crossX - padding.left) / candleW);
      if (idx >= 0 && idx < data.length) {
        const d = data[idx];
        const cx = toX(idx - start);
        const cy = toY(d.close);

        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cx, padding.top);
        ctx.lineTo(cx, h - padding.bottom);
        ctx.moveTo(padding.left, cy);
        ctx.lineTo(w - padding.right, cy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tooltip
        const tipW = 130, tipH = 65;
        let tipX = cx + 12;
        if (tipX + tipW > w) tipX = cx - tipW - 12;
        ctx.fillStyle = 'rgba(17,21,32,0.95)';
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.roundRect(tipX, padding.top + 4, tipW, tipH, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f6f8fc';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`O ${this._fmt(d.open)}  H ${this._fmt(d.high)}`, tipX + 8, padding.top + 22);
        ctx.fillText(`L ${this._fmt(d.low)}  C ${this._fmt(d.close)}`, tipX + 8, padding.top + 40);
        ctx.fillStyle = '#667086';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText(this._timeFmt(d.time, false), tipX + 8, padding.top + 58);
      }
    }
  }

  _fmt(p) {
    if (p >= 10000) return p.toFixed(0);
    if (p >= 1000) return p.toFixed(1);
    if (p >= 1) return p.toFixed(2);
    if (p >= 0.01) return p.toFixed(6);
    return p.toFixed(8);
  }

  _timeFmt(ts, mini) {
    const d = new Date(ts * 1000);
    if (mini) return `${d.getMonth()+1}/${d.getDate()}`;
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  destroy() {
    cancelAnimationFrame(this._raf);
    this.canvas.remove();
  }
}

function renderMainChart(data) {
  if (mainChart) { mainChart.setData(data); return; }
  mainChart = new CanvasChart('mainChart');
  mainChart.setData(data);
}

function renderMiniChart(data) {
  if (miniChartInst) { miniChartInst.setData(data); return; }
  miniChartInst = new CanvasChart('miniChart', true);
  miniChartInst.setData(data);
}

// Standalone research chart — no CanvasChart class, direct canvas draw
function drawResearchChart() {
  const canvas = document.getElementById('researchCanvas');
  const wrap = document.getElementById('researchChartWrap');
  if (!canvas || !wrap) return;

  const rect = wrap.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    setTimeout(drawResearchChart, 300);
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width, H = rect.height;

  // Clear
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Generate data
  const data = generateSimulatedKlines('SOLUSDT', '4h', 120);
  const visible = data.slice(-60);
  const padding = { top: 16, right: 50, bottom: 20, left: 8 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;
  const candleW = chartW / visible.length;

  let minP = Infinity, maxP = -Infinity;
  for (const d of visible) {
    if (d.low < minP) minP = d.low;
    if (d.high > maxP) maxP = d.high;
  }
  const range = maxP - minP || 1;
  const toY = (p) => padding.top + chartH * (1 - (p - minP) / range);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 5; i++) {
    const y = padding.top + (chartH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(W - padding.right, y);
    ctx.stroke();
    const price = maxP - (range * i) / 4;
    ctx.fillStyle = '#5A5040';
    ctx.font = '9px IBM Plex Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(price >= 10 ? price.toFixed(1) : price.toFixed(2), W - 4, y + 3);
  }

  // Candles
  for (let i = 0; i < visible.length; i++) {
    const d = visible[i];
    const x = padding.left + i * candleW + candleW / 2;
    const bw = Math.max(1, candleW * 0.65);
    const isUp = d.close >= d.open;
    const bodyTop = toY(Math.max(d.open, d.close));
    const bodyBot = toY(Math.min(d.open, d.close));
    const bodyH = Math.max(1, bodyBot - bodyTop);

    ctx.strokeStyle = isUp ? '#3dd68c' : '#f97066';
    ctx.fillStyle = isUp ? '#3dd68c' : '#f97066';
    ctx.lineWidth = 0.5;

    // Wick
    ctx.beginPath();
    ctx.moveTo(x, toY(d.high));
    ctx.lineTo(x, toY(d.low));
    ctx.stroke();

    // Body
    if (bodyH < 1) {
      ctx.beginPath();
      ctx.moveTo(x - bw / 2, bodyTop);
      ctx.lineTo(x + bw / 2, bodyTop);
      ctx.stroke();
    } else {
      ctx.fillRect(x - bw / 2, bodyTop, bw, bodyH);
    }
  }

  // Entry zone annotation
  const entryTop = toY(176);
  const entryBot = toY(173);
  ctx.fillStyle = 'rgba(255,119,34,0.12)';
  ctx.fillRect(padding.left, entryTop, chartW, entryBot - entryTop);
  ctx.strokeStyle = 'rgba(255,119,34,0.5)';
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(padding.left, entryTop);
  ctx.lineTo(W - padding.right, entryTop);
  ctx.moveTo(padding.left, entryBot);
  ctx.lineTo(W - padding.right, entryBot);
  ctx.stroke();
  ctx.setLineDash([]);

  // Labels
  ctx.fillStyle = '#FF7722';
  ctx.font = '9px IBM Plex Mono, monospace';
  ctx.textAlign = 'left';
  const lastX = padding.left + (visible.length - 1) * candleW + candleW / 2;
  ctx.fillText('Entry $173-176', lastX - 100, entryTop - 4);
}

// ══════════════════════════════════════════
// LIVE PRICE BAR
// ══════════════════════════════════════════

function renderPriceBar(data) {
  if (!data.length) return;
  const last = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : last;
  const change = last.close - prev.close;
  const changePct = prev.close ? ((change / prev.close) * 100) : 0;
  const dir = change >= 0 ? 'up' : 'down';
  const sign = change >= 0 ? '+' : '';

  const vol = last.volume;
  const volStr = vol > 1e6 ? (vol / 1e6).toFixed(1) + 'M' : vol > 1e3 ? (vol / 1e3).toFixed(1) + 'K' : vol.toFixed(0);

  document.getElementById('livePriceBar').innerHTML = `
    <div class="price-detail">
      <span class="price-current">${fmtPrice(last.close)}</span>
      <span class="price-change ${dir}">${sign}${changePct.toFixed(2)}%</span>
      <small>O ${fmtPrice(last.open)}  H ${fmtPrice(last.high)}  L ${fmtPrice(last.low)}  Vol ${volStr}</small>
    </div>
    <small>Last candle · ${new Date(last.closeTime).toLocaleTimeString()}</small>
  `;
}

function fmtPrice(p) {
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (p >= 0.01) return p.toFixed(6);
  return p.toFixed(8);
}

// ══════════════════════════════════════════
// RAW DATA TABLE — FOR PROCESSING / MARKOV
// ══════════════════════════════════════════

function renderRawDataTable(data) {
  const tbody = document.getElementById('rawDataBody');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="loading-cell">No data received from Binance API.</td></tr>';
    return;
  }

  // Show last 50 candles (most recent first)
  const rows = data.slice(-50).reverse();
  tbody.innerHTML = rows.map(k => {
    const prevClose = data.length > 1 ? data[data.indexOf(k) - 1]?.close || k.open : k.open;
    const deltaPct = prevClose ? (((k.close - prevClose) / prevClose) * 100) : 0;
    const rangePct = ((k.high - k.low) / k.low) * 100;
    const dir = deltaPct > 0.5 ? 'dir-up' : deltaPct < -0.5 ? 'dir-down' : 'dir-flat';
    const dirLabel = deltaPct > 0.5 ? '▲ Bull' : deltaPct < -0.5 ? '▼ Bear' : '─ Flat';
    return `
      <tr>
        <td>${new Date(k.openTime).toLocaleString()}</td>
        <td>${fmtPrice(k.open)}</td>
        <td>${fmtPrice(k.high)}</td>
        <td>${fmtPrice(k.low)}</td>
        <td>${fmtPrice(k.close)}</td>
        <td>${k.volume.toFixed(0)}</td>
        <td class="${dir}">${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(2)}%</td>
        <td>${rangePct.toFixed(2)}%</td>
        <td class="${dir}">${dirLabel}</td>
      </tr>`;
  }).join('');

  updateSourceLabel();
}

function updateSourceLabel(source) {
  const label = document.getElementById('chartSourceLabel');
  if (label) {
    const srcText = source || `${rawKlineData.length} candles`;
    label.textContent = `Source: ${srcText} · ${rawKlineData.length} candles · no embed, no widget`;
  }
}

// ══════════════════════════════════════════
// CHART STAT CARDS — COMPUTED FROM RAW DATA
// ══════════════════════════════════════════

function updateChartStatsFromData(data) {
  if (!data.length) return;
  const last = data[data.length - 1];
  const recent = data.slice(-20);
  const highs = recent.map(k => k.high);
  const lows = recent.map(k => k.low);
  const atr = recent.reduce((sum, k, i) => {
    if (i === 0) return 0;
    const tr = Math.max(k.high - k.low, Math.abs(k.high - recent[i - 1].close), Math.abs(k.low - recent[i - 1].close));
    return sum + tr;
  }, 0) / (recent.length - 1);

  const firstClose = recent[0].close;
  const lastClose = last.close;
  const trendPct = ((lastClose - firstClose) / firstClose) * 100;
  const trendDir = trendPct > 2 ? '▲ Uptrend' : trendPct < -2 ? '▼ Downtrend' : '→ Sideways';

  const volAvg = recent.reduce((s, k) => s + k.volume, 0) / recent.length;
  const volRatio = last.volume / volAvg;

  const volLabel = volRatio > 1.5 ? 'Spiking' : volRatio > 1.0 ? 'Above avg' : 'Below avg';
  const trendRisk = Math.abs(trendPct) > 8 ? 'High' : Math.abs(trendPct) > 3 ? 'Medium' : 'Low';

  document.getElementById('chartStats').innerHTML = `
    <article class="card stat-card">
      <p class="label">Price Action (20 candles)</p>
      <strong>${trendDir}</strong>
      <small>${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(2)}% · ATR: ${fmtPrice(atr)}</small>
    </article>
    <article class="card stat-card">
      <p class="label">Volume Analysis</p>
      <strong>${volLabel}</strong>
      <small>${volRatio.toFixed(1)}x avg · Last: ${last.volume > 1e6 ? (last.volume/1e6).toFixed(1)+'M' : last.volume.toFixed(0)}</small>
    </article>
    <article class="card stat-card">
      <p class="label">Markov Read (computed)</p>
      <strong>${trendRisk} risk</strong>
      <small>Based on volatility, trend strength, and volume context. ${trendRisk === 'High' ? 'Trade smaller.' : trendRisk === 'Medium' ? 'Check twice.' : 'Favorable.'}</small>
    </article>
  `;
}

// ══════════════════════════════════════════
// RAW DATA ACTIONS — COPY / DOWNLOAD
// ══════════════════════════════════════════

function bindRawDataButtons() {
  document.getElementById('copyJsonBtn').addEventListener('click', () => {
    const json = JSON.stringify(rawKlineData, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      const btn = document.getElementById('copyJsonBtn');
      btn.innerHTML = '<span class="material-symbols-rounded">check</span>Copied!';
      setTimeout(() => { btn.innerHTML = '<span class="material-symbols-rounded">content_copy</span>Copy JSON'; }, 2000);
    }).catch(() => alert('Failed to copy. Check console for data.'));
  });

  document.getElementById('downloadJsonBtn').addEventListener('click', () => {
    const json = JSON.stringify(rawKlineData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCoin.pair}_${currentInterval}_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('toggleRawBtn').addEventListener('click', () => {
    document.getElementById('rawDataTableWrapper').classList.toggle('collapsed');
  });
}

// ══════════════════════════════════════════
// CHART SWITCHING
// ══════════════════════════════════════════

function selectCoin(symbol, goToCharts) {
  const next = coins.find(c => c.symbol === symbol);
  if (!next) return;
  activeCoin = next;
  document.getElementById('activeChartTitle').textContent = activeCoin.title;
  renderCoinTabs();
  loadChartData(activeCoin.pair, currentInterval, 'main');
  if (goToCharts) navigate('charts');
}

function bindTimeframes() {
  document.querySelectorAll('.tf').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.tf').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const label = btn.textContent.trim();
    currentIntervalLabel = label;
    currentInterval = INTERVAL_MAP[label] || '1h';
    loadChartData(activeCoin.pair, currentInterval, 'main');
  }));
}

// ══════════════════════════════════════════
// AUTO REFRESH (every 30 seconds on charts page)
// ══════════════════════════════════════════

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    const chartsPage = document.getElementById('charts-page');
    if (chartsPage && chartsPage.classList.contains('active')) {
      loadChartData(activeCoin.pair, currentInterval, 'main');
    }
    // Always refresh mini chart
    loadChartData('BTCUSDT', '1h', 'mini');
  }, 30000);
}

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════

function bindNavigation() {
  document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', event => {
    event.preventDefault();
    navigate(el.dataset.page);
  }));
}

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `${page}-page`));
  document.querySelectorAll('.bn-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  const label = document.getElementById('pageLabel');
  const labels = { research:'Research', archive:'Archive', performance:'Performance', dashboard:'Dashboard', charts:'Charts', scanner:'Scanner', journal:'Journal', coach:'Coach', dna:'DNA' };
  if (label) label.textContent = labels[page] || 'Dashboard';
  // Trigger resize on chart when navigating to charts page
  if (page === 'charts') {
    setTimeout(() => {
      if (mainChart) mainChart._resize();
      loadChartData(activeCoin.pair, currentInterval, 'main');
    }, 100);
  }
  // Init research chart when navigating to research page
  if (page === 'research') {
    setTimeout(() => drawResearchChart(), 600);
  }
}

// ══════════════════════════════════════════
// UI RENDERERS (unchanged from original except watchlist navigates to charts)
// ══════════════════════════════════════════

function renderPulse() {
  document.getElementById('pulseGrid').innerHTML = pulse.map(([label, value, note, color]) => `
    <button class="pulse-card ${color}" data-sheet="pulseSheet">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </button>
  `).join('');
}

function renderWatchlist() {
  const el = document.getElementById('watchlistTable');
  if (!el) return;
  const featured = coins.slice(0, 6);
  document.getElementById('watchlistTable').innerHTML = featured.map(c => `
    <button class="watch-row" data-coin="${c.symbol}">
      <div class="coin-name"><strong>${c.symbol}</strong><small>${c.name}</small></div>
      <span>${c.thesis}</span>
      <b class="score ${c.risk === 'High' ? 'yellow' : ''}">${c.probability}%</b>
      <span class="badge">${c.trend}</span>
      <small>${c.momentum}</small>
    </button>
  `).join('');
  document.querySelectorAll('[data-coin]').forEach(row => row.addEventListener('click', () => selectCoin(row.dataset.coin, true)));
}

function renderCoinTabs() {
  document.getElementById('coinTabs').innerHTML = coins.map(c => `
    <button class="coin-tab ${c.symbol === activeCoin.symbol ? 'active' : ''}" data-chart-coin="${c.symbol}">${c.symbol}</button>
  `).join('');
  document.querySelectorAll('[data-chart-coin]').forEach(tab => tab.addEventListener('click', () => selectCoin(tab.dataset.chartCoin, false)));
}

function renderScanner(filter) {
  const sorted = coins.slice().sort((a, b) => filter === 'Low risk' ? riskRank(a.risk) - riskRank(b.risk) : b.markov - a.markov);
  document.getElementById('scannerTable').innerHTML = `
    <div class="scanner-row header"><span>Coin</span><span>Decision note</span><span>Markov</span><span>Volume</span><span>Move</span><span>Funding</span><span>Risk</span></div>
    ${sorted.map(c => `
      <button class="scanner-row" data-scan-coin="${c.symbol}">
        <div class="coin-name"><strong>${c.symbol}</strong><small>${c.name}</small></div>
        <span>${c.thesis}</span>
        <b class="score">${c.markov}</b>
        <b>${c.volume}</b>
        <span>${c.momentum}</span>
        <span>${c.funding}</span>
        <span class="badge">${c.risk}</span>
      </button>
    `).join('')}
  `;
  document.querySelectorAll('[data-scan-coin]').forEach(row => row.addEventListener('click', () => selectCoin(row.dataset.scanCoin, true)));
}

function renderChartStats() {
  // Called on init — shows placeholder until data loads
  document.getElementById('chartStats').innerHTML = `
    <article class="card stat-card"><p class="label">Price Action</p><strong>Loading...</strong><small>Waiting for Binance data</small></article>
    <article class="card stat-card"><p class="label">Volume Analysis</p><strong>—</strong><small>Waiting for Binance data</small></article>
    <article class="card stat-card"><p class="label">Markov Read</p><strong>—</strong><small>Waiting for Binance data</small></article>
  `;
}

function bindFilters() {
  document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    renderScanner(chip.dataset.filter);
  }));
}

function riskRank(risk) { return { Low: 1, Medium: 2, High: 3 }[risk] || 2; }

// ══════════════════════════════════════════
// BOTTOM SHEETS
// ══════════════════════════════════════════

function bindSheets() {
  document.body.addEventListener('click', event => {
    const trigger = event.target.closest('[data-sheet]');
    if (!trigger) return;
    openSheet(trigger.dataset.sheet);
  });
  document.getElementById('sheetBackdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSheet(); });
}

function openSheet(key) {
  if (key === 'newTradeSheet') return openTradeForm();
  const data = sheetTemplates[key];
  if (!data) return;
  const rows = data.rows.map(([a, b]) => `<div class="sheet-row"><span>${a}</span><b>${b}</b></div>`).join('');
  document.getElementById('sheetContent').innerHTML = `
    <div class="sheet-content">
      <div class="sheet-hero">
        <div class="sheet-icon"><span class="material-symbols-rounded">${data.icon}</span></div>
        <div><h2>${data.title}</h2><p>${data.body}</p></div>
      </div>
      <div class="sheet-list">${rows}</div>
      <button class="primary-action" onclick="closeSheet()">${data.action}</button>
    </div>
  `;
  showSheet();
}

function openTradeForm() {
  document.getElementById('sheetContent').innerHTML = `
    <div class="sheet-content">
      <div class="sheet-hero">
        <div class="sheet-icon"><span class="material-symbols-rounded">add_card</span></div>
        <div><h2>New Trading Card</h2><p>Capture the decision before the result. This is how your edge compounds.</p></div>
      </div>
      <form class="sheet-form" id="tradeForm">
        <select id="tfCoin"><option>SOL</option><option>BTC</option><option>SUI</option><option>ETH</option><option>LINK</option><option>RNDR</option><option>DOGE</option><option>PEPE</option></select>
        <select id="tfDirection"><option value="long">Long</option><option value="short">Short</option></select>
        <input id="tfEntry" type="number" step="any" placeholder="Entry price" />
        <input id="tfExit" type="number" step="any" placeholder="Exit price" />
        <input id="tfSize" type="number" step="any" placeholder="Position size (USDT)" />
        <input id="tfThesis" placeholder="Entry thesis" value="Range reclaim with rising volume" />
        <input id="tfConfidence" type="number" min="0" max="100" placeholder="Confidence %" value="72" />
        <select id="tfEmotion"><option>Calm</option><option>FOMO</option><option>Greed</option><option>Revenge</option><option>Excited</option><option>Stress</option><option>Confident</option></select>
        <select id="tfTimeframe"><option>4H</option><option>1H</option><option>15m</option><option>1D</option></select>
        <textarea id="tfInvalidation" placeholder="What would invalidate this trade?">BTC closes back inside range.</textarea>
        <button class="primary-action" type="submit">Save Trading Card</button>
      </form>
    </div>
  `;
  showSheet();
  document.getElementById('tradeForm').addEventListener('submit', async event => {
    event.preventDefault();
    const entry = parseFloat(document.getElementById('tfEntry').value) || 0;
    const exit = parseFloat(document.getElementById('tfExit').value) || 0;
    const size = parseFloat(document.getElementById('tfSize').value) || 0;
    const direction = document.getElementById('tfDirection').value;
    const pnl = direction === 'long' ? (exit - entry) * (size / entry) : (entry - exit) * (size / entry);
    const risk = size * 0.02; // assume 2% risk
    const pnlR = risk > 0 ? pnl / risk : 0;

    const trade = {
      coin: document.getElementById('tfCoin').value,
      direction,
      entry,
      exit,
      size,
      pnl: parseFloat(pnl.toFixed(2)),
      pnlR: parseFloat(pnlR.toFixed(2)),
      thesis: document.getElementById('tfThesis').value,
      confidence: parseInt(document.getElementById('tfConfidence').value) || 50,
      emotion: document.getElementById('tfEmotion').value,
      timeframe: document.getElementById('tfTimeframe').value,
      invalidation: document.getElementById('tfInvalidation').value,
      checklist: ['Trend', 'Volume', 'Market Regime'],
      mistakes: [],
      lessons: ''
    };

    try {
      await saveTrade(trade);
      console.log('Trade saved to DB');
    } catch (e) {
      console.error('Failed to save trade:', e);
    }
    closeSheet();
    refreshDashboardStats();
  });
}

function showSheet() {
  document.getElementById('sheetBackdrop').classList.add('open');
  document.getElementById('bottomSheet').classList.add('open');
  document.getElementById('bottomSheet').setAttribute('aria-hidden', 'false');
}

function closeSheet() {
  document.getElementById('sheetBackdrop').classList.remove('open');
  document.getElementById('bottomSheet').classList.remove('open');
  document.getElementById('bottomSheet').setAttribute('aria-hidden', 'true');
}

// ══════════════════════════════════════════
// AI COACH
// ══════════════════════════════════════════

function bindCoach() {
  document.querySelectorAll('[data-question]').forEach(btn => btn.addEventListener('click', () => askCoach(btn.dataset.question)));
  document.getElementById('coachForm').addEventListener('submit', event => {
    event.preventDefault();
    const input = document.getElementById('coachInput');
    if (!input.value.trim()) return;
    askCoach(input.value.trim());
    input.value = '';
  });
}

function askCoach(question) {
  const thread = document.getElementById('coachThread');
  thread.insertAdjacentHTML('beforeend', `<div class="bubble user">${escapeHtml(question)}</div>`);
  const answers = {
    'Why did my winrate drop?': 'Your winrate dropped because you traded more during sideways market. The issue is not coin selection. It is timing and emotional size increase after wins.',
    'Which coin fits me today?': 'SOL fits your DNA today. LINK is safer but slower. Avoid PEPE because your journal shows meme trades trigger FOMO entries.',
    'Review my last trade': 'Your last SOL trade was a high-quality decision. You waited for support, defined invalidation, and stayed calm after entry.'
  };
  const answer = answers[question] || 'I would check three things before acting: BTC regime, volume confirmation, and whether this setup matches your historical winners. If confidence is below 65%, skip it.';
  window.setTimeout(() => {
    thread.insertAdjacentHTML('beforeend', `<div class="bubble ai">${answer}</div>`);
    thread.scrollTop = thread.scrollHeight;
  }, 300);
  thread.scrollTop = thread.scrollHeight;
}

function escapeHtml(text) {
  return text.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

// ══════════════════════════════════════════
// GLOBALS
// ══════════════════════════════════════════

window.closeSheet = closeSheet;
window.navigate = navigate;

// ══════════════════════════════════════════
// DASHBOARD STATS — from IndexedDB
// ══════════════════════════════════════════

async function refreshDashboardStats() {
  const panel = document.getElementById('dbStatsPanel');
  if (!panel) return;

  try {
    const stats = await getDashboardStats();
    const { candles, trades, dna, patterns } = stats;

    const dnaStatus = dna && dna.status === 'ready'
      ? '<strong>' + (dna.personality || '-') + ' \u00b7 WR ' + (dna.winrate || '-') + '%</strong><small>Best: ' + (dna.bestCoin || '-') + ' \u00b7 ' + (dna.bestTimeframe || '-') + '</small>'
      : '<strong>Waiting for trades</strong><small>Need 5+ trades to build DNA</small>';

    const topPattern = patterns.length > 0
      ? patterns.sort(function(a, b) { return b.frequency - a.frequency; })[0]
      : null;

    const patternHtml = topPattern
      ? '<strong>' + topPattern.label + '</strong><small>' + topPattern.detail + '</small>'
      : '<strong>No patterns yet</strong><small>Trade journal grows \u2192 patterns emerge</small>';

    panel.innerHTML = [
      '<div class="section-head"><div>',
      '<p class="label">Local Database</p>',
      '<h3>IndexedDB \u2014 persistent across sessions</h3>',
      '</div></div>',
      '<div class="db-stats-grid">',
      '<div class="db-stat-card"><span class="material-symbols-rounded">database</span><b>' + candles.toLocaleString() + '</b><small>Candles stored</small></div>',
      '<div class="db-stat-card"><span class="material-symbols-rounded">view_carousel</span><b>' + trades.total + '</b><small>Trades \u00b7 WR ' + trades.winrate + '%</small></div>',
      '<div class="db-stat-card ' + (trades.total > 0 && parseFloat(trades.winrate) >= 50 ? 'positive' : '') + '"><span class="material-symbols-rounded">trending_up</span><b>' + trades.avgR + 'R</b><small>Avg R \u00b7 Best ' + trades.bestR + 'R</small></div>',
      '<div class="db-stat-card"><span class="material-symbols-rounded">fingerprint</span>' + dnaStatus + '</div>',
      '<div class="db-stat-card"><span class="material-symbols-rounded">psychology</span>' + patternHtml + '</div>',
      '<div class="db-stat-card"><span class="material-symbols-rounded">local_fire_department</span><b>' + trades.maxWinStreak + '</b><small>Best win streak</small></div>',
      '</div>'
    ].join('');
  } catch (e) {
    console.error('Failed to load DB stats:', e);
    panel.innerHTML = '<p style="color:var(--muted);padding:16px">IndexedDB initializing...</p>';
  }
}

document.addEventListener('DOMContentLoaded', init);
