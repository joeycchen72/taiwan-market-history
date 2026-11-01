// B-class data, sampled on each month's formation date (first trading day on/after the 11th, when last month's revenue is public):
//  foreign holdings + shares issued, margin balances, P/E-yield-P/B (TWSE + TPEx, that day), monthly revenue with industry (MOPS).
// Resumable, newest first, each host keeps its own spacing. env: BUDGET_MS (50 min), START (2014-01)
import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'data','b'),progFile=path.join(dir,'progress.json');
const T0=Date.now(),BUDGET=Number(process.env.BUDGET_MS||50*60000),START=process.env.START||'2014-01',DELAY={twse:4000,tpex:10000,mops:5000};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),n=v=>{const x=Number(String(v??'').replace(/[,%\s]/g,''));return Number.isFinite(x)?x:'';};
const UA={'User-Agent':'Mozilla/5.0 (research backfill; github.com/joeycchen72/taiwan-market-history)'};
const TRANSIENT=/HTTP (403|429|5\d\d)|terminated|timeout|aborted|fetch failed|ECONNRESET/i;
async function getJson(u){const r=await fetch(u,{headers:{...UA,Accept:'application/json'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('HTTP '+r.status);const t=await r.text();if(/^\s*</.test(t))throw Error('HTML instead of JSON (possibly blocked)');return JSON.parse(t);}
async function getBig5(u){const r=await fetch(u,{headers:UA,signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('HTTP '+r.status);return new TextDecoder('big5').decode(Buffer.from(await r.arrayBuffer()));}
const ymd=d=>d.replace(/-/g,''),slash=d=>encodeURIComponent(d.replace(/-/g,'/'));
// ---------- parsers (exported for tests) ----------
export const code=c=>String(c||'').trim();
export function parseTwseQfii(j){if(j.stat!=='OK'||!Array.isArray(j.data))return null;return j.data.map(r=>[code(r[0]),n(r[3]),n(r[5]),n(r[7])]);}
export function parseTpexQfii(j){const t=j.tables?.[0];if(!t||!Array.isArray(t.data))return null;return t.data.map(r=>[code(r[1]),n(r[3]),n(r[5]),n(r[7])]);}
export function parseTwseMargin(j){if(j.stat!=='OK')return null;const t=(j.tables||[]).find(x=>/彙總/.test(x.title||''));if(!t)return null;return t.data.map(r=>[code(r[0]),n(r[6]),n(r[12])]);}
export function parseTpexMargin(j){const t=j.tables?.[0];if(!t||!Array.isArray(t.data))return null;return t.data.map(r=>[code(r[0]),n(r[6]),n(r[14])]);}
export function parseTwsePe(j){if(j.stat!=='OK'||!Array.isArray(j.data))return null;return j.data.map(r=>[code(r[0]),n(r[2]),n(r[3]),n(r[4])]);}
export function parseTpexPe(j){const t=j.tables?.[0];if(!t||!Array.isArray(t.data))return null;return t.data.map(r=>[code(r[0]),n(r[2]),n(r[5]),n(r[6])]);}
const strip=s=>s.replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim();
export function parseRevenue(html){const out=[];const parts=html.split('產業別：');for(const p of parts.slice(1)){const ind=strip(p.slice(0,p.indexOf('<'))).trim();
  for(const m of p.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)){const cells=[...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>strip(x[1]));if(cells.length<10||!/^\d{4}$/.test(cells[0]))continue;
   out.push([cells[0],ind,n(cells[2]),n(cells[3]),n(cells[4]),n(cells[7]),n(cells[8])]);}}
 return out;}
export const HEAD={qfii:'code,issued,foreign_held,foreign_pct',margin:'code,margin_lots,short_lots',pe:'code,pe,yield,pb',revenue:'code,industry,rev,prev_month_rev,last_year_rev,cum_rev,last_cum_rev'};
// ---------- formation dates from the downloaded daily status ----------
export function formationDates(progress,start=START){const tw=Object.entries(progress.markets.twse).filter(([,v])=>String(v).startsWith('ok')).map(([d])=>d).sort(),out=new Map();
 for(const d of tw){const m=d.slice(0,7);if(m<start)continue;if(+d.slice(8)>=11&&!out.has(m))out.set(m,d);}return [...out.entries()].map(([month,date])=>({month,date}));}
export const REFETCH_FROM='2026-11';
export function decisionDate(progress,month,day=16){return Object.entries(progress.markets.twse).filter(([d,v])=>d.slice(0,7)===month&&+d.slice(8)>=day&&String(v).startsWith('ok')).map(([d])=>d).sort()[0]||null;}
const prevMonth=m=>{const [y,mo]=m.split('-').map(Number);const d=new Date(Date.UTC(y,mo-2,1));return d.toISOString().slice(0,7);};
async function main(){fs.mkdirSync(dir,{recursive:true});const daily=JSON.parse(fs.readFileSync(path.join(root,'data','progress.json'),'utf8')),prog=fs.existsSync(progFile)?JSON.parse(fs.readFileSync(progFile,'utf8')):{done:{},failures:{}};
 const fds=formationDates(daily).reverse(),errors=[];let saved=0;
 const save=(kind,key,rows)=>{const p=path.join(dir,kind,key.slice(0,4),key+'.csv.gz');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,zlib.gzipSync(HEAD[kind.split('-')[0]]+'\n'+rows.map(r=>r.join(',')).join('\n')+'\n',{level:9}));};
 const jobs={twse:[],tpex:[],mops:[]};
 for(const {month,date} of fds){
  jobs.twse.push([`qfii-twse|${date}`,()=>getJson(`https://www.twse.com.tw/rwd/zh/fund/MI_QFIIS?date=${ymd(date)}&selectType=ALLBUT0999&response=json`).then(parseTwseQfii),'qfii-twse',date]);
  jobs.twse.push([`margin-twse|${date}`,()=>getJson(`https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?date=${ymd(date)}&selectType=ALL&response=json`).then(parseTwseMargin),'margin-twse',date]);
  jobs.twse.push([`pe-twse|${date}`,()=>getJson(`https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${ymd(date)}&selectType=ALL&response=json`).then(parseTwsePe),'pe-twse',date]);
  jobs.tpex.push([`qfii-tpex|${date}`,()=>getJson(`https://www.tpex.org.tw/www/zh-tw/insti/qfii?date=${slash(date)}&response=json`).then(parseTpexQfii),'qfii-tpex',date]);
  jobs.tpex.push([`margin-tpex|${date}`,()=>getJson(`https://www.tpex.org.tw/www/zh-tw/margin/balance?date=${slash(date)}&response=json`).then(parseTpexMargin),'margin-tpex',date]);
  jobs.tpex.push([`pe-tpex|${date}`,()=>getJson(`https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryDate?date=${slash(date)}&response=json`).then(parseTpexPe),'pe-tpex',date]);
  const rm=prevMonth(month),[y,mo]=rm.split('-').map(Number);
  for(const mk of ['sii','otc'])jobs.mops.push([`revenue-${mk}|${rm}`,()=>getBig5(`https://mopsov.twse.com.tw/nas/t21/${mk}/t21sc03_${y-1911}_${mo}_0.html`).then(parseRevenue),'revenue-'+mk,rm]);
  // v3.1 (Issue #20): from 2026-11, re-fetch last month's revenue on the decision date (first trading day on/after the 16th),
  // after every known filing deadline (insurers / financial holding companies: 15th), overwriting the earlier copy.
  const d16=decisionDate(daily,month);if(month>=REFETCH_FROM&&d16)for(const mk of ['sii','otc'])jobs.mops.unshift([`revenue16-${mk}|${rm}`,()=>getBig5(`https://mopsov.twse.com.tw/nas/t21/${mk}/t21sc03_${y-1911}_${mo}_0.html`).then(parseRevenue),'revenue-'+mk,rm]);}
 async function worker(host){let consecutive=0;for(const [key,fn,kind,k] of jobs[host]){if(prog.done[key])continue;if(Date.now()-T0>BUDGET){errors.push(host+' stopping: time budget');return;}
  try{const rows=await fn();if(!rows||rows.length<(kind.startsWith('revenue')?300:200))throw Error('too few rows ('+(rows?rows.length:0)+')');save(kind,k,rows);prog.done[key]='ok:'+rows.length;delete prog.failures[key];saved++;consecutive=0;}
  catch(e){prog.failures[key]=(prog.failures[key]||0)+1;errors.push(key+' '+e.message);if(prog.failures[key]>=3&&!TRANSIENT.test(e.message))prog.done[key]='failed:'+e.message.slice(0,80);consecutive++;if(consecutive>=5){errors.push(host+' stopping: 5 consecutive failures');return;}}
  await sleep(DELAY[host]);}}
 await Promise.all(Object.keys(jobs).map(worker));
 const total=Object.values(jobs).reduce((a,x)=>a+x.length,0),done=Object.keys(prog.done).length;
 fs.writeFileSync(progFile,JSON.stringify(prog,null,1)+'\n');const status={at:new Date().toISOString(),formations:fds.length,saved,errors:errors.slice(0,20),progress:{done,total,pct:+(done/total*100).toFixed(1)}};
 fs.writeFileSync(path.join(dir,'status.json'),JSON.stringify(status,null,1)+'\n');console.log(JSON.stringify(status));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
