// Update live prices to Supabase — runs every 5 min via GitHub Actions
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const COINS = [
  { id: 'bitcoin', coin: 'BTC' },
  { id: 'ethereum', coin: 'ETH' },
  { id: 'solana', coin: 'SOL' },
  { id: 'sui', coin: 'SUI' },
  { id: 'chainlink', coin: 'LINK' },
  { id: 'render-token', coin: 'RNDR' },
  { id: 'dogecoin', coin: 'DOGE' },
  { id: 'pepe', coin: 'PEPE' }
];

async function main() {
  const ids = COINS.map(c => c.id).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

  try {
    const res = await fetch(url);
    if (!res.ok) { console.error('CoinGecko error:', res.status); process.exit(1); }
    const data = await res.json();

    for (const c of COINS) {
      const p = data[c.id];
      if (!p) continue;
      const record = {
        coin: c.coin,
        price: p.usd,
        change_24h: p.usd_24h_change || 0,
        updated_at: new Date().toISOString()
      };
      // Upsert via PATCH
      await fetch(`${SUPABASE_URL}/rest/v1/live_prices?coin=eq.${c.coin}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(record)
      });
      // If PATCH returns 0 rows (new coin), INSERT
      await fetch(`${SUPABASE_URL}/rest/v1/live_prices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(record)
      }).catch(() => {});
    }
    console.log('Prices updated:', new Date().toISOString());
  } catch (e) {
    console.error('Failed:', e.message);
    process.exit(1);
  }
}
main();
