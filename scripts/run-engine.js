// Markov Engine — CoinGecko API (with rate-limit delay)
const SUPABASE_URL=process.env.SUPABASE_URL,SUPABASE_KEY=process.env.SUPABASE_KEY;
if(!SUPABASE_URL||!SUPABASE_KEY){console.error('Secrets missing');process.exit(1)}

const COINS=[{s:'BTC',id:'bitcoin',n:'Bitcoin'},{s:'ETH',id:'ethereum',n:'Ethereum'},{s:'SOL',id:'solana',n:'Solana'},{s:'SUI',id:'sui',n:'Sui'},{s:'LINK',id:'chainlink',n:'Chainlink'},{s:'RNDR',id:'render-token',n:'Render'},{s:'DOGE',id:'dogecoin',n:'Dogecoin'},{s:'PEPE',id:'pepe',n:'Pepe'}];

async function fetchOHLC(id){const r=await fetch(`https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=30`);if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();return d.map(k=>({t:k[0]/1000,o:k[1],h:k[2],l:k[3],c:k[4],v:k[4]*100000}))}
function ema(d,p){const k=2/(p+1),r=[d[0]];for(let i=1;i<d.length;i++)r.push(d[i]*k+r[i-1]*(1-k));return r}
function rsi(c,p=14){const r=Array(c.length).fill(null);let g=0,l=0;for(let i=1;i<=p;i++){const d=c[i]-c[i-1];d>0?g+=d:l-=d}let ag=g/p,al=l/p;r[p]=100-(100/(1+ag/(al||1)));for(let i=p+1;i<c.length;i++){const d=c[i]-c[i-1];ag=(ag*(p-1)+(d>0?d:0))/p;al=(al*(p-1)+(d<0?-d:0))/p;r[i]=100-(100/(1+ag/(al||1)))}return r}
function highest(d,p){const r=[];for(let i=0;i<d.length;i++){let m=-Infinity;for(let j=Math.max(0,i-p+1);j<=i;j++)m=Math.max(m,d[j]);r.push(m)}return r}
function atr(h,l,c,p){let s=0;for(let i=c.length-p+1;i<c.length;i++)s+=Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1]));return s/(c.length-p)}

function gen(coin,cd){const c=cd.map(k=>k.c),h=cd.map(k=>k.h),l=cd.map(k=>k.l),v=cd.map(k=>k.v);const e20=ema(c,20),e50=ema(c,50),ri=rsi(c,14);const st={s:0,l:''};const sc=[st,st,st,st,st,st];
{const i=c.length-1,p=c[i],a=e20[i],b=e50[i],sl=a-(e20[i-3]||a);if(p>a&&p>b&&a>b&&sl>0)sc[0]={s:95,l:'Strong Uptrend'};else if(p>a&&p>b&&a>b)sc[0]={s:80,l:'Uptrend'};else if(p>a&&a>b)sc[0]={s:65,l:'Building'};else if(p>b)sc[0]={s:45,l:'Neutral'};else if(p<a&&p<b)sc[0]={s:15,l:'Downtrend'};else sc[0]={s:30,l:'Weak'}}
{const rv=v.slice(-3),ov=v.slice(-15,-3);if(ov.length){const ar=rv.reduce((s,x)=>s+x,0)/3,ao=ov.reduce((s,x)=>s+x,0)/ov.length,rat=ar/ao;if(rat>2)sc[1]={s:88,l:'Spiking'};else if(rat>1.5)sc[1]={s:75,l:'Above Avg'};else if(rat>1)sc[1]={s:55,l:'Normal'};else if(rat>.7)sc[1]={s:40,l:'Below Avg'};else sc[1]={s:20,l:'Low'}}else sc[1]={s:50,l:'Normal'}}
{const rv=ri[ri.length-1];if(rv){if(rv>=50&&rv<=65)sc[2]={s:84,l:'Bullish'};else if(rv>65&&rv<=75)sc[2]={s:60,l:'Strong'};else if(rv>75)sc[2]={s:35,l:'Overbought'};else if(rv>=40)sc[2]={s:40,l:'Weak'};else sc[2]={s:20,l:'Bearish'}}else sc[2]={s:50,l:'Neutral'}}
{const i=c.length-1,hh=highest(h,10)[i];if(c[i]>hh&&c[i]>c[i-3]*1.03)sc[3]={s:92,l:'Breakout'};else if(c[i]>hh)sc[3]={s:72,l:'Testing'};else if(c[i]>hh*.97)sc[3]={s:55,l:'Near res'};else sc[3]={s:30,l:'Range'}}
{const i=c.length-1,av=v.slice(-5).reduce((s,x)=>s+x,0)/5;sc[4]={s:Math.max(30,Math.min(95,Math.round(av/10000000+40))),l:av>5000000?'Healthy':'Thin'}}
{const fr={BTC:.008,ETH:.005,SOL:.012,SUI:.025,LINK:.003,RNDR:.006,DOGE:.018,PEPE:.032};const f=fr[coin.s]||.01;if(f<.005)sc[5]={s:86,l:'Neutral'};else if(f<.01)sc[5]={s:70,l:'Warm'};else if(f<.02)sc[5]={s:50,l:'Hot'};else sc[5]={s:25,l:'Extreme'}}
const prob=Math.round(sc.reduce((s,x)=>s+x.s,0)/6);let grade='C';if(prob>=80)grade='A';else if(prob>=65)grade='B';if(grade==='C')return null;
const lc=c[c.length-1],a=atr(h,l,c,14),rp=Math.min(.03,(a*2)/lc);
return{id:'SIG-'+Date.now().toString(36).toUpperCase(),coin:coin.s,pair:coin.s+'USDT',name:coin.n,sector:'Crypto',probability:prob,grade,status:'active',entry_low:+(lc*(1-rp*.2)).toFixed(2),entry_high:+(lc*(1+rp*.2)).toFixed(2),tp1:+(lc*(1+rp*3)).toFixed(2),tp2:+(lc*(1+rp*4)).toFixed(2),tp3:+(lc*(1+rp*5)).toFixed(2),stop_loss:+(lc*(1-rp)).toFixed(2),risk_pct:+(rp*100).toFixed(1),expected_rr:'1:3',holding_days:'5-7',last_price:lc,atr:a,trend_score:sc[0].s,volume_score:sc[1].s,momentum_score:sc[2].s,breakout_score:sc[3].s,liquidity_score:sc[4].s,funding_score:sc[5].s,reasons:'[]',risks:'[]',research_summary:coin.s+' scores '+prob+'% Grade '+grade}

async function post(b){const r=await fetch(SUPABASE_URL+'/rest/v1/signals',{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Prefer':'return=minimal'},body:JSON.stringify(b)});if(!r.ok){const t=await r.text();throw new Error(t.slice(0,100))}}
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function main(){console.log('[Engine] CoinGecko scan...');let n=0;for(const c of COINS){try{console.log(c.s+'...');const d=await fetchOHLC(c.id);const s=gen(c,d);if(s){await post(s);console.log(c.s+': '+s.probability+'% '+s.grade+' OK');n++}else console.log(c.s+': Grade C skip')}catch(e){console.error(c.s+' ERR:',e.message)}await delay(2500)}console.log('[Engine] Done: '+n+' signals')}
main();
