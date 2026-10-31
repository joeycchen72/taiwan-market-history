// Errata v1.1 of factors-v1 (Issue #12). Same SPEC, features, eligibility, costs, periods, bootstrap seed and verdict rule.
// Only change: the candidate pool, scores and the top-10% list are fixed with data <= t BEFORE any forward return is looked at.
// Stocks whose forward return cannot be evaluated (no next-day open, an unknown-return day inside the hold) are then dropped
// from their own group's average and counted, never replaced by the next-ranked stock. A formation is skipped only when the
// whole holding window is beyond the end of the data (maturity, decided by date, not by stock).
// node research/factors-v1.1.mjs [out.json] [--min-history N]   (min-history: sensitivity only, default 0 = SPEC as written)
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {loadPanel,isCommon} from './lib/data.mjs';
import {SPEC,features,eligible,forward,judge} from './factors-v1.mjs';
const require=createRequire(import.meta.url),E=require('./vendor/engine.js');
export const ERRATA=Object.freeze({version:'factors-v1.1',basedOn:SPEC.version,issue:12});
function adjustedRows(s,dates){const rows=[],idx=[];for(let t=0;t<dates.length;t++)if(s.c[t]>0&&s.o[t]>0){const f=s.tri[t]/s.c[t];rows.push({date:dates[t],open:s.o[t]*f,high:s.h[t]*f,low:s.l[t]*f,close:s.c[t]*f,volume:s.val[t]/s.c[t]});idx.push(t);}return {rows,idx,pos:new Map(idx.map((t,i)=>[t,i]))};}
const history=(s,t)=>{let n=0;for(let k=Math.max(0,t-251);k<=t;k++)if(s.c[k]>0)n++;return n;};
export function run(panel,{minHistory=0}={}){const {dates,series}=panel,D=dates.length,codes=[...series.keys()].filter(isCommon).sort(),monthFirst=new Set();let pm='';dates.forEach((d,t)=>{if(d.slice(0,7)!==pm){monthFirst.add(t);pm=d.slice(0,7);}});
 const out={},stats={excludedUnknown:0,noNextOpen:0,delistExits:0,droppedFromPicks:0};for(const k of Object.keys(SPEC.tests))out[k]=[];const adj=new Map();
 for(let t=SPEC.warmup;t<D-1;t++){const monthly=monthFirst.has(t),pool=[];
  for(const c of codes){const s=series.get(c);if(!eligible(s,t))continue;if(minHistory&&history(s,t)<minHistory)continue;pool.push(c);}
  if(pool.length<50)continue;
  for(const [key,cfg] of Object.entries(SPEC.tests)){if(cfg.freq==='monthly'&&!monthly)continue;if(t+cfg.hold>=D)continue;
   // 1) decide with data <= t only
   const scored=[];for(const c of pool){const s=series.get(c);let score;
    if(key==='S0'){if(!adj.has(c))adj.set(c,adjustedRows(s,dates));const a=adj.get(c),i=a.pos.get(t);if(i===undefined||i<64)continue;score=E.evaluate(a.rows.slice(Math.max(0,i-99),i+1)).eligible?1:0;}
    else{score=features(s,t)[key];if(!Number.isFinite(score))continue;}scored.push({c,score});}
   if(scored.length<50)continue;let top,rest;
   if(key==='S0'){top=scored.filter(x=>x.score===1);rest=scored.filter(x=>x.score!==1);if(!top.length)continue;}
   else{scored.sort((a,b)=>b.score-a.score||a.c.localeCompare(b.c));const n=Math.max(1,Math.floor(scored.length*SPEC.decile));top=scored.slice(0,n);rest=scored.slice(n);}
   // 2) only now look at forward returns
   const ret=(xs,isTop)=>{const r=[];for(const x of xs){const fw=forward(series.get(x.c),t,cfg.hold,D);if(!fw){stats.noNextOpen++;if(isTop)stats.droppedFromPicks++;continue;}if(fw.excluded){stats.excludedUnknown++;if(isTop)stats.droppedFromPicks++;continue;}if(isTop&&fw.delistExit)stats.delistExits++;r.push(fw.r);}return r;};
   const a=ret(top,true),b=ret(rest,false);if(!a.length||!b.length)continue;const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
   out[key].push({date:dates[t],excess:mean(a)-mean(b),top:mean(a),n:a.length,selected:top.length,universe:scored.length});}}
 return {series:out,stats};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),i=process.argv.indexOf('--min-history'),minHistory=i>0?Number(process.argv[i+1]):0,t0=Date.now(),panel=loadPanel(root),{series,stats}=run(panel,{minHistory});
 const result={spec:ERRATA.version,basedOn:SPEC.version,minHistory,dataRange:[panel.dates[0],panel.dates.at(-1)],stats,results:Object.fromEntries(Object.entries(SPEC.tests).map(([k,c])=>[k,{...c,...judge(series[k],k)}])),seconds:Math.round((Date.now()-t0)/1000)};
 const out=process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:null;const text=JSON.stringify(result,null,1);if(out)fs.writeFileSync(out,text+'\n');console.log(text);}
