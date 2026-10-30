// Resumable, polite backfill of official daily quotes. Newest dates first. Safe to stop at any time.
// env: MAX_REQUESTS (default 150), DELAY_MS (default 4000), START (default 2014-01-01), END (default: yesterday, Taipei)
import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import {fileURLToPath} from 'node:url';
import {parseTwse,parseTpex,urls,toCsv,ymd} from './sources.mjs';
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
 const parsers={twse:parseTwse,tpex:parseTpex};let used=0,saved=0,closed=0,errors=[],consecutive=0;
 outer:for(const date of weekdays(START,END)){for(const m of ['twse','tpex']){
  if(progress.markets[m][date])continue;if(used>=MAX)break outer;used++;
  try{const j=await get(urls[m](date)),r=parsers[m](j,date);
   if(r.status==='ok'){if(r.rows.length<50)throw Error('too few rows ('+r.rows.length+')');const dir=path.join(data,m,date.slice(0,4));fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,ymd(date)+'.csv.gz'),zlib.gzipSync(toCsv(r.rows),{level:9}));progress.markets[m][date]='ok:'+r.rows.length;saved++;}
   else{progress.markets[m][date]='closed';closed++;}
   delete progress.failures[m+'|'+date];consecutive=0;
  }catch(e){const k=m+'|'+date;progress.failures[k]=(progress.failures[k]||0)+1;errors.push(k+' '+e.message);if(progress.failures[k]>=3)progress.markets[m][date]='failed:'+e.message.slice(0,80);consecutive++;if(consecutive>=5){errors.push('stopping: 5 consecutive failures (source may be limiting requests)');break outer;}}
  await sleep(DELAY);}}
 fs.writeFileSync(progressFile,JSON.stringify(progress,null,1)+'\n');
 const all=weekdays(START,END).length*2,done=Object.values(progress.markets).reduce((n,m)=>n+Object.keys(m).length,0);
 const status={at:new Date().toISOString(),range:[START,END],requests:used,saved,closed,errors:errors.slice(0,20),progress:{done,total:all,pct:+(done/all*100).toFixed(1)}};
 fs.writeFileSync(path.join(data,'status.json'),JSON.stringify(status,null,1)+'\n');console.log(JSON.stringify(status));
 if(used&&!saved&&!closed)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
