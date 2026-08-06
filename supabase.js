// ══════════════════════════════════════════
// Supabase Client — Minimal REST Wrapper
// ══════════════════════════════════════════

const SUPABASE_URL = 'https://ajxebmjqveisffueghay.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqeGVibWpxdmVpc2ZmdWVnaGF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMTU5ODAsImV4cCI6MjEwMTU5MTk4MH0.KO0mB0TfqnGVdF4ft7oSHZMi8caeM_NsXsdTkvOL1XI';

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

async function fetchSignals() {
  try {
    const signals = await supabaseGet('signals?status=eq.active&order=probability.desc&limit=10');
    return signals.map(s => ({
      id: s.id,
      coin: s.coin,
      pair: s.pair,
      name: s.name,
      sector: s.sector,
      probability: s.probability,
      grade: s.grade,
      status: s.status,
      entryZone: { low: s.entry_low, high: s.entry_high },
      tp1: s.tp1, tp2: s.tp2, tp3: s.tp3,
      stopLoss: s.stop_loss,
      riskPct: s.risk_pct,
      expectedRR: s.expected_rr,
      holdingDays: s.holding_days,
      lastPrice: s.last_price,
      atr: s.atr,
      scores: {
        trend: { score: s.trend_score, label: '' },
        volume: { score: s.volume_score, label: '' },
        momentum: { score: s.momentum_score, label: '' },
        breakout: { score: s.breakout_score, label: '' },
        liquidity: { score: s.liquidity_score, label: '' },
        funding: { score: s.funding_score, label: '' }
      },
      reasons: s.reasons || [],
      risks: s.risks || [],
      researchSummary: s.research_summary,
      generatedAt: s.generated_at
    }));
  } catch (e) {
    console.error('Supabase fetch failed:', e);
    return [];
  }
}
