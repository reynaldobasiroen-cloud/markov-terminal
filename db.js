// ══════════════════════════════════════════
// MARKOV TERMINAL — IndexedDB Layer
// ══════════════════════════════════════════

const DB_NAME = 'markov_terminal';
const DB_VERSION = 1;

let db = null;

// ─── Open / Init ────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const d = e.target.result;

      // ── market_data: raw OHLCV candles ──
      if (!d.objectStoreNames.contains('market_data')) {
        const store = d.createObjectStore('market_data', { keyPath: 'id' });
        store.createIndex('symbol_interval', ['symbol', 'interval'], { unique: false });
        store.createIndex('timestamp', 'time', { unique: false });
      }

      // ── trades: full decision context ──
      if (!d.objectStoreNames.contains('trades')) {
        const store = d.createObjectStore('trades', { keyPath: 'id', autoIncrement: true });
        store.createIndex('coin', 'coin', { unique: false });
        store.createIndex('created', 'created', { unique: false });
        store.createIndex('result', 'result', { unique: false });
      }

      // ── trading_dna: computed profile ──
      if (!d.objectStoreNames.contains('trading_dna')) {
        d.createObjectStore('trading_dna', { keyPath: 'id' });
      }

      // ── decision_patterns: mined insights ──
      if (!d.objectStoreNames.contains('decision_patterns')) {
        d.createObjectStore('decision_patterns', { keyPath: 'id' });
      }

      // ── missions: weekly goals + progress ──
      if (!d.objectStoreNames.contains('missions')) {
        const store = d.createObjectStore('missions', { keyPath: 'id', autoIncrement: true });
        store.createIndex('week', 'week', { unique: false });
      }
    };

    req.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    req.onerror = (e) => reject(e.target.error);
  });
}

// ─── Generic helpers ──────────────────────────

function tx(storeName, mode = 'readonly') {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAll(storeName) {
  return promisify(tx(storeName).getAll());
}

function count(storeName) {
  return promisify(tx(storeName).count());
}

function put(storeName, value) {
  return promisify(tx(storeName, 'readwrite').put(value));
}

function remove(storeName, key) {
  return promisify(tx(storeName, 'readwrite').delete(key));
}

// ══════════════════════════════════════════
// MARKET DATA — store fetched candles
// ══════════════════════════════════════════

async function saveMarketData(symbol, interval, candles) {
  const store = tx('market_data', 'readwrite');
  let saved = 0;
  for (const c of candles) {
    const id = `${symbol}_${interval}_${c.openTime}`;
    const existing = await promisify(store.get(id));
    if (!existing) {
      await promisify(store.put({
        id,
        symbol,
        interval,
        time: c.time,
        openTime: c.openTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        quoteVolume: c.quoteVolume,
        trades: c.trades,
        savedAt: Date.now()
      }));
      saved++;
    }
  }
  return saved;
}

async function getMarketData(symbol, interval, limit = 200) {
  const index = tx('market_data').index('symbol_interval');
  const range = IDBKeyRange.only([symbol, interval]);
  const all = await promisify(index.getAll(range));
  all.sort((a, b) => a.openTime - b.openTime);
  return all.slice(-limit);
}

async function getTotalCandles() {
  return count('market_data');
}

// ══════════════════════════════════════════
// TRADES — trading cards
// ══════════════════════════════════════════

async function saveTrade(trade) {
  const record = {
    ...trade,
    created: Date.now(),
    result: trade.pnl >= 0 ? 'win' : 'loss',
    pnlR: trade.pnlR || 0  // R-multiple
  };
  const id = await promisify(tx('trades', 'readwrite').add(record));
  await recomputeDNA();
  await minePatterns();
  return id;
}

async function getTrades(limit = 50) {
  const all = await getAll('trades');
  all.sort((a, b) => b.created - a.created);
  return all.slice(0, limit);
}

async function getTradeStats() {
  const all = await getAll('trades');
  const wins = all.filter(t => t.result === 'win');
  const losses = all.filter(t => t.result === 'loss');
  const totalPnl = all.reduce((s, t) => s + (t.pnl || 0), 0);
  const avgR = all.length ? all.reduce((s, t) => s + (t.pnlR || 0), 0) / all.length : 0;
  const maxWin = wins.length ? Math.max(...wins.map(t => t.pnlR || 0)) : 0;
  const maxLoss = losses.length ? Math.min(...losses.map(t => t.pnlR || 0)) : 0;

  // Win streak
  let streak = 0, maxStreak = 0;
  const sorted = [...all].sort((a, b) => a.created - b.created);
  for (const t of sorted) {
    if (t.result === 'win') { streak++; maxStreak = Math.max(maxStreak, streak); }
    else streak = 0;
  }

  return {
    total: all.length,
    wins: wins.length,
    losses: losses.length,
    winrate: all.length ? ((wins.length / all.length) * 100).toFixed(1) : '0.0',
    totalPnl: totalPnl.toFixed(2),
    avgR: avgR.toFixed(2),
    bestR: maxWin.toFixed(2),
    worstR: maxLoss.toFixed(2),
    maxWinStreak: maxStreak,
    longCount: all.filter(t => t.direction === 'long').length,
    shortCount: all.filter(t => t.direction === 'short').length
  };
}

// ══════════════════════════════════════════
// TRADING DNA — computed from all trades
// ══════════════════════════════════════════

async function recomputeDNA() {
  const all = await getAll('trades');
  if (all.length < 5) {
    await put('trading_dna', { id: 'profile', status: 'insufficient_data', tradeCount: all.length });
    return;
  }

  const wins = all.filter(t => t.result === 'win');
  const winrate = (wins.length / all.length) * 100;

  // Best/worst coin
  const byCoin = {};
  for (const t of all) {
    if (!byCoin[t.coin]) byCoin[t.coin] = { wins: 0, total: 0, pnlR: 0 };
    byCoin[t.coin].total++;
    byCoin[t.coin].pnlR += (t.pnlR || 0);
    if (t.result === 'win') byCoin[t.coin].wins++;
  }
  const coins = Object.entries(byCoin).map(([coin, d]) => ({
    coin, winrate: (d.wins / d.total * 100).toFixed(1), avgR: (d.pnlR / d.total).toFixed(2), total: d.total
  }));
  coins.sort((a, b) => parseFloat(b.avgR) - parseFloat(a.avgR));

  // Best timeframe
  const byTF = {};
  for (const t of all) {
    if (!byTF[t.timeframe]) byTF[t.timeframe] = { wins: 0, total: 0 };
    byTF[t.timeframe].total++;
    if (t.result === 'win') byTF[t.timeframe].wins++;
  }
  const bestTF = Object.entries(byTF).sort((a, b) =>
    (b[1].wins / b[1].total) - (a[1].wins / a[1].total)
  )[0]?.[0] || 'unknown';

  // Emotion analysis
  const emotions = {};
  for (const t of all) { emotions[t.emotion] = (emotions[t.emotion] || 0) + 1; }

  // Mistake frequency
  const mistakes = {};
  for (const t of all) {
    if (t.mistakes) {
      for (const m of t.mistakes) { mistakes[m] = (mistakes[m] || 0) + 1; }
    }
  }
  const topMistakes = Object.entries(mistakes).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);

  // Personality
  const avgHoldMs = all.reduce((s, t) => s + (t.holdMinutes || 240), 0) / all.length;
  let personality = 'swing';
  if (avgHoldMs < 60) personality = 'scalper';
  else if (avgHoldMs < 360) personality = 'momentum';
  else if (avgHoldMs < 1440) personality = 'trend';

  // Strengths
  const strengths = [];
  if (winrate > 55) strengths.push('Discipline');
  if (maxWinStreak >= 3) strengths.push('Patience');
  if (all.filter(t => t.pnlR > 1.5).length / all.length > 0.3) strengths.push('Risk Management');
  if (all.filter(t => t.direction === 'long').length / all.length > 0.6) strengths.push('Trend Following');

  // Weaknesses
  const weaknesses = [];
  if (all.filter(t => t.emotion === 'FOMO').length / all.length > 0.3) weaknesses.push('FOMO');
  if (all.filter(t => t.mistakes?.includes('Late Entry')).length > 1) weaknesses.push('Late Entry');
  if (all.filter(t => t.pnlR < -1.5).length / all.length > 0.2) weaknesses.push('Risk Control');

  const dna = {
    id: 'profile',
    status: 'ready',
    tradeCount: all.length,
    personality,
    winrate: winrate.toFixed(1),
    avgR: (all.reduce((s, t) => s + (t.pnlR || 0), 0) / all.length).toFixed(2),
    bestCoin: coins[0]?.coin || 'unknown',
    worstCoin: coins[coins.length - 1]?.coin || 'unknown',
    bestTimeframe: bestTF,
    strengths,
    weaknesses,
    topMistakes,
    topEmotion: Object.entries(emotions).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown',
    updated: Date.now()
  };

  await put('trading_dna', dna);
}

async function getDNA() {
  return promisify(tx('trading_dna').get('profile'));
}

// ══════════════════════════════════════════
// DECISION PATTERNS — mined behavioral insights
// ══════════════════════════════════════════

async function minePatterns() {
  const all = await getAll('trades');
  if (all.length < 5) {
    await put('decision_patterns', { id: 'patterns', status: 'insufficient', tradeCount: all.length });
    return;
  }

  const patterns = [];

  // Pattern: consecutive-win overtrade risk
  const sorted = [...all].sort((a, b) => a.created - b.created);
  let streak = 0;
  for (const t of sorted) {
    if (t.result === 'win') {
      streak++;
    } else if (streak >= 2) {
      patterns.push({
        id: `pattern_overtrade_after_win`,
        label: 'Overtrade risk after winning streaks',
        detail: `After ${streak} consecutive wins, next trade tends to underperform.`,
        frequency: streak,
        severity: 'medium',
        type: 'behavioral'
      });
      streak = 0;
    } else {
      streak = 0;
    }
  }

  // Pattern: emotion → result correlation
  const emotionResults = {};
  for (const t of all) {
    const key = t.emotion || 'unknown';
    if (!emotionResults[key]) emotionResults[key] = { wins: 0, total: 0 };
    emotionResults[key].total++;
    if (t.result === 'win') emotionResults[key].wins++;
  }
  for (const [emotion, d] of Object.entries(emotionResults)) {
    if (d.total >= 2) {
      const wr = (d.wins / d.total) * 100;
      patterns.push({
        id: `pattern_emotion_${emotion.toLowerCase()}`,
        label: `Emotion: ${emotion}`,
        detail: `${wr.toFixed(0)}% winrate when feeling ${emotion} (${d.total} trades).`,
        frequency: d.total,
        severity: wr < 40 ? 'high' : wr < 55 ? 'medium' : 'low',
        type: 'emotional'
      });
    }
  }

  // Pattern: confidence level → result
  const confBins = { low: { wins: 0, total: 0 }, medium: { wins: 0, total: 0 }, high: { wins: 0, total: 0 } };
  for (const t of all) {
    const conf = (t.confidence || 50) < 40 ? 'low' : (t.confidence || 50) < 70 ? 'medium' : 'high';
    confBins[conf].total++;
    if (t.result === 'win') confBins[conf].wins++;
  }
  for (const [level, d] of Object.entries(confBins)) {
    if (d.total >= 2) {
      const wr = (d.wins / d.total) * 100;
      patterns.push({
        id: `pattern_confidence_${level}`,
        label: `Confidence: ${level}`,
        detail: `${wr.toFixed(0)}% winrate when confidence is ${level} (${d.total} trades).`,
        frequency: d.total,
        severity: wr < 40 ? 'high' : wr < 55 ? 'medium' : 'low',
        type: 'decision'
      });
    }
  }

  await put('decision_patterns', {
    id: 'patterns',
    patterns,
    tradeCount: all.length,
    updated: Date.now()
  });
}

async function getPatterns() {
  const result = await promisify(tx('decision_patterns').get('patterns'));
  return result?.patterns || [];
}

// ══════════════════════════════════════════
// MISSIONS — weekly goals
// ══════════════════════════════════════════

async function getCurrentMission() {
  const all = await getAll('missions');
  all.sort((a, b) => b.week - a.week);
  return all[0] || null;
}

async function createMission(mission) {
  const week = getWeekNumber(new Date());
  return promisify(tx('missions', 'readwrite').add({ ...mission, week, created: Date.now() }));
}

function getWeekNumber(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
}

// ══════════════════════════════════════════
// DASHBOARD STATS — combined readout
// ══════════════════════════════════════════

async function getDashboardStats() {
  const [trades, candles, dna, patterns, mission] = await Promise.all([
    getTradeStats(),
    getTotalCandles(),
    getDNA(),
    getPatterns(),
    getCurrentMission()
  ]);

  return {
    candles,
    trades,
    dna: dna || { status: 'empty', tradeCount: 0 },
    patterns: patterns || [],
    mission
  };
}

// ─── Init on page load ────────────────────────

openDB().then(() => console.log('IndexedDB ready — markov_terminal v' + DB_VERSION));
