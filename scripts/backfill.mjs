// Resumable, polite backfill of official daily quotes. Newest dates first. Safe to stop at any time.
// env: MAX_REQUESTS (default 150), DELAY_MS (default 4000), START (default 2014-01-01), END (default: yesterday, Taipei)
import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import {fileURLToPath} from 'node:url';
import {parseTwse,parseTpex,parseTwt49u,urls,toCsv,ymd,keepEquity,EQUITY,COLUMNS,EXRIGHT_COLUMNS} from './sources.mjs';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),data=path.join(root,'data'),progressFile=path.join(data,'progress.json');
const MAX=Number(process.env.MAX_REQUESTS||150),DELAY=Number(process.env.DELAY_MS||4000),START=process.env.START||'2014-01-01';
const taipeiDay=t=>new Date(t+28800000).toISOString().slice(0,10);
const END=process.env.END||taipeiDay(Date.now()-86400000);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function weekdays(start,end){const out=[];for(let t=Date.parse(end+'T00:00:00Z');t>=Date.parse(start+'T00:00:00Z');t-=86400000){const d=new Date(t),w=d.getUTCDay();if(w>0&&w<6)out.push(d.toISOString().slice(0,10));}return out;}
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'Accept':'application/json','User-Agent':'Mozilla/5.0 (research backfill; github.com/joeycchen72/taiwan-market-history)'}});if(!r.ok)throw Error('HTTP '+r.status);const text=await r.text();if(/^\s*</.test(text))throw Error('HTML instead of JSON (possibly blocked)');return JSON.parse(text);}
async function main(){
 fs.mkdirSync(data,{recursive:true});
 const progress=fs.existsSync(progressFile)?JSON.parse(fs.readFileSync(progressFile,'utf8')):{version:1,start:START,markets:{twse:{},tpex:{}},failures:{}};
 for(const m of ['twse','tpex'])for(const y of fs.existsSync(path.join(data,m))?fs.readdirSync(path.join(data,m)):[])for(const f of fs.readdirSync(path.join(data,m,y))){const p=path.join(data,m,y,f),lines=zlib.gunzipSync(fs.readFileSync(p)).toString().split('\n').filter(Boolean),body=lines.slice(1).filter(l=>EQUITY.test(l.split(',')[0]));if(body.length!==lines.length-1)fs.writeFileSync(p,zlib.gzipSync(COLUMNS.join(',')+'\n'+body.join('\n')+'\n',{level:9}));}
 // v2 migration (2026-10-30, before any research use): TPEx files saved without the official next-day reference price
 // (needed for ex-dividend days, which the exchanges mark as not-compared) are fetched again once.
 if((progress.version||1)<2){for(const [d,st] of Object.entries(progress.markets.tpex)){if(!String(st).startsWith('ok'))continue;const p=path.join(data,'tpex',d.slice(0,4),ymd(d)+'.csv.gz');const head=fs.existsSync(p)?zlib.gunzipSync(fs.readFileSync(p)).toString().split('\n')[0]:'';if(!head.includes('next_ref')){if(fs.existsSync(p))fs.rmSync(p);delete progress.markets.tpex[d];}}progress.version=2;progress.migrations=[...(progress.migrations||[]),{at:new Date().toISOString(),note:'TPEx files without next_ref removed for one re-fetch'}];}
 progress.markets.twseExright=progress.markets.twseExright||{};
 const parsers={twse:parseTwse,tpex:parseTpex};let used=0,saved=0,closed=0,errors=[],consecutive=0;
 // TWSE ex-rights results, one request per month (newest first)
 const months=[...new Set(weekdays(START,END).map(d=>d.slice(0,7)))];
 let exUsed=0;for(const mo of months){if(used>=MAX||exUsed>=12)break;if(progress.markets.twseExright[mo])continue;exUsed++;used++;
  try{const r=parseTwt49u(await get(urls.twseExright(mo)));const dir=path.join(data,'twse-exright',mo.slice(0,4));fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,mo+'.csv.gz'),zlib.gzipSync(toCsv(r.rows,EXRIGHT_COLUMNS),{level:9}));progress.markets.twseExright[mo]=r.status+':'+r.rows.length;delete progress.failures['twseExright|'+mo];saved++;}
  catch(e){const k='twseExright|'+mo;progress.failures[k]=(progress.failures[k]||0)+1;errors.push(k+' '+e.message);if(progress.failures[k]>=3)progress.markets.twseExright[mo]='failed:'+e.message.slice(0,80);}
  await sleep(DELAY);}
 outer:for(const date of weekdays(START,END)){for(const m of ['twse','tpex']){
  if(progress.markets[m][date])continue;if(used>=MAX)break outer;used++;
  try{const j=await get(urls[m](date)),r=parsers[m](j,date);
   if(r.status==='ok'){r.rows=keepEquity(r.rows);if(r.rows.length<50)throw Error('too few rows ('+r.rows.length+')');const dir=path.join(data,m,date.slice(0,4));fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,ymd(date)+'.csv.gz'),zlib.gzipSync(toCsv(r.rows),{level:9}));progress.markets[m][date]='ok:'+r.rows.length;saved++;}
   else{progress.markets[m][date]='closed';closed++;}
   delete progress.failures[m+'|'+date];consecutive=0;
  }catch(e){const k=m+'|'+date;progress.failures[k]=(progress.failures[k]||0)+1;errors.push(k+' '+e.message);if(progress.failures[k]>=3)progress.markets[m][date]='failed:'+e.message.slice(0,80);consecutive++;if(consecutive>=5){errors.push('stopping: 5 consecutive failures (source may be limiting requests)');break outer;}}
  await sleep(DELAY);}}
 fs.writeFileSync(progressFile,JSON.stringify(progress,null,1)+'\n');
 const all=weekdays(START,END).length*2+months.length,done=Object.values(progress.markets).reduce((n,m)=>n+Object.keys(m).length,0);
 const status={at:new Date().toISOString(),range:[START,END],requests:used,saved,closed,errors:errors.slice(0,20),progress:{done,total:all,pct:+(done/all*100).toFixed(1)}};
 fs.writeFileSync(path.join(data,'status.json'),JSON.stringify(status,null,1)+'\n');console.log(JSON.stringify(status));
 if(used&&!saved&&!closed)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
