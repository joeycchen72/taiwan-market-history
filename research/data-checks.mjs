// Pre-registered data checks C1–C6 (SPEC-v1 §2). node research/data-checks.mjs [out.json]
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {listFiles,readDay,isCommon,loadPanel} from './lib/data.mjs';
export function runChecks(root){
 const files=listFiles(root),progress=JSON.parse(fs.readFileSync(path.join(root,'data','progress.json'),'utf8')),res={};
 // C1: market status consistency on every recorded weekday
 const dates=new Set([...Object.keys(progress.markets.twse),...Object.keys(progress.markets.tpex)]),odd=[],missing=[];
 for(const d of dates){const a=progress.markets.twse[d],b=progress.markets.tpex[d];if(!a||!b||/^failed/.test(a)||/^failed/.test(b)){missing.push(d);continue;}if((a==='closed')!==(b==='closed'))odd.push(d);}
 res.C1={pass:odd.length<=5&&missing.length===0,oneMarketOnly:odd.sort(),missingOrFailed:missing.sort().slice(0,50),missingCount:missing.length};
 // C2, C4, C6 per file; C3, C5 need code histories
 const low=[],seen=new Map(),lastDates=[...new Set(files.map(f=>f.date))].sort().slice(-20),lastSet=new Set();let rows=0,bad=0,xs=0;const events=[];const prevClose=new Map();
 for(const f of files.sort((a,b)=>a.date.localeCompare(b.date)||a.market.localeCompare(b.market))){const day=readDay(f.file),common=day.filter(r=>isCommon(r.code));
  if(common.length<(f.market==='twse'?600:450))low.push(f.market+' '+f.date+' '+common.length);
  for(const r of day){if(!(isCommon(r.code)||r.code==='0050'))continue;rows++;if(r.flag==='X')xs++;
   if(r.c>0&&(!(r.o>0)||!(r.h>0)||!(r.l>0)||r.h<Math.max(r.o,r.c)-1e-9||r.l>Math.min(r.o,r.c)+1e-9))bad++;
   if(!seen.has(r.code))seen.set(r.code,f.date);if(lastDates.includes(f.date))lastSet.add(r.code);
}}
 res.C2={pass:low.length===0,belowThreshold:low.slice(0,50),count:low.length};
 const delisted=[...seen.entries()].filter(([c,d])=>d<='2016-12-31'&&!lastSet.has(c)&&isCommon(c)).map(([c])=>c);
 res.C3={pass:delisted.length>=100,count:delisted.length,sample:delisted.slice(0,20)};
 res.C4={pass:rows>0&&bad/rows<0.001,violations:bad,rows};
 // C5/C6 from the panel: reference price = official ex-rights price on not-compared days, else close - change
 const panel=loadPanel(root);let xNoRef=0;for(const [code,sr] of panel.series){let pc=NaN;for(let t=0;t<panel.dates.length;t++){const c=sr.c[t];if(!(c>0))continue;const ref=sr.x[t]?sr.ref[t]:c-sr.chg[t];if(sr.x[t]&&!(sr.ref[t]>0))xNoRef++;if(pc>0&&ref>0&&ref/pc-1<-0.002)events.push({code,date:panel.dates[t],gap:ref/pc-1});pc=c;}}
 const byYear={},summer={};for(const e of events){const y=e.date.slice(0,4),m=+e.date.slice(5,7);byYear[y]=(byYear[y]||0)+1;if(m>=6&&m<=9)summer[y]=(summer[y]||0)+1;}
 const years=Object.keys(byYear).sort(),total=events.length,inSummer=Object.values(summer).reduce((a,b)=>a+b,0);
 const count=(code,y)=>events.filter(e=>e.code===code&&e.date.startsWith(y)).length,fullYears=years.filter(y=>y<String(new Date().getUTCFullYear()));
 const tsmc=fullYears.filter(y=>y>='2020').map(y=>[y,count('2330',y)]),etf=fullYears.filter(y=>y>='2015').map(y=>[y,count('0050',y)]);
 res.C5={pass:total>0&&fullYears.every(y=>byYear[y]>0)&&inSummer/total>=0.5&&tsmc.every(([,n])=>n>=4)&&etf.every(([,n])=>n>=1),eventsByYear:byYear,summerShare:total?+(inSummer/total).toFixed(3):null,tsmcPerYear:Object.fromEntries(tsmc),etf0050PerYear:Object.fromEntries(etf)};
 res.C6={pass:rows>0&&xNoRef/rows<0.01,notComparedRows:xs,notComparedWithoutOfficialRef:xNoRef,rows};
 res.allPass=Object.values(res).every(r=>r.pass);res.files=files.length;res.dateRange=[files[0]?.date||null,files.at(-1)?.date||null];return res;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),r=runChecks(root),text=JSON.stringify(r,null,1);if(process.argv[2])fs.writeFileSync(process.argv[2],text+'\n');console.log(text);}
