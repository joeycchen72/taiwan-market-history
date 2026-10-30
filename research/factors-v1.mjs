// Pre-registered cross-sectional tests S0, H1–H5 (SPEC-v1 §3–4). node research/factors-v1.mjs [out.json]
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
import {loadPanel,isCommon} from './lib/data.mjs';
const require=createRequire(import.meta.url),E=require('./vendor/engine.js');
export const SPEC=Object.freeze({version:'factors-v1',warmup:252,minPrice:10,minAvgValue:2e7,decile:0.1,costPct:0.785,blockMonths:3,resamples:2000,alpha:0.05/6,
 periods:{design:['2014-01-01','2019-12-31'],validation:['2020-01-01','2022-12-31'],test:['2023-01-01','9999-12-31']},
 tests:{S0:{name:'網站原訊號',freq:'daily',hold:20},H1:{name:'短期反轉',freq:'daily',hold:5},H2:{name:'低波動',freq:'monthly',hold:21},H3:{name:'接近60日高點',freq:'monthly',hold:21},H4:{name:'12–1個月動能',freq:'monthly',hold:21},H5:{name:'接近52週高點',freq:'monthly',hold:21}}});
// features at t using only data <= t; larger value = more "in" the condition
export function features(s,t){const tri=s.tri,f={};
 f.H1=t>=5&&tri[t-5]>0?-(tri[t]/tri[t-5]-1):NaN;
 if(t>=60){let m=0,n=0,v=0;const r=[];for(let k=t-59;k<=t;k++){if(tri[k-1]>0&&tri[k]>0){r.push(tri[k]/tri[k-1]-1);}}if(r.length>=50){m=r.reduce((a,b)=>a+b,0)/r.length;v=r.reduce((a,b)=>a+(b-m)**2,0)/(r.length-1);f.H2=-Math.sqrt(v);}else f.H2=NaN;}else f.H2=NaN;
 const hi=(w)=>{let h=0;for(let k=Math.max(0,t-w+1);k<=t;k++){const x=s.h[k]*s.tri[k]/s.c[k];if(x>h)h=x;}return h;};
 f.H3=t>=59?tri[t]/hi(60):NaN;f.H4=t>=252&&tri[t-252]>0?tri[t-21]/tri[t-252]-1:NaN;f.H5=t>=251?tri[t]/hi(252):NaN;
 for(const k of Object.keys(f))if(!Number.isFinite(f[k]))f[k]=NaN;return f;}
export function eligible(s,t){if(!(s.c[t]>0)||s.c[t]<SPEC.minPrice)return false;let v=0;for(let k=t-19;k<=t;k++)v+=s.val[k]>0?s.val[k]:0;return v/20>=SPEC.minAvgValue;}
// forward total return: next open in, close of t+hold out; null when not matured or an unknown-return day is inside
export function forward(s,t,hold,D){const e=t+hold;if(e>=D||!(s.o[t+1]>0)||!(s.c[t+1]>0))return null;for(let k=t+1;k<=e;k++)if(s.unk[k])return {excluded:true};
 const entry=s.o[t+1]*s.tri[t+1]/s.c[t+1];let lastTrade=-1;for(let k=e;k>t;k--)if(s.c[k]>0){lastTrade=k;break;}
 let after=false;if(lastTrade<e)for(let k=e+1;k<D;k++)if(s.c[k]>0){after=true;break;}
 return {r:s.tri[e]/entry-1,delistExit:lastTrade<e&&!after};}
function adjustedRows(s,dates){const rows=[],idx=[];for(let t=0;t<dates.length;t++)if(s.c[t]>0&&s.o[t]>0){const f=s.tri[t]/s.c[t];rows.push({date:dates[t],open:s.o[t]*f,high:s.h[t]*f,low:s.l[t]*f,close:s.c[t]*f,volume:s.val[t]/s.c[t]});idx.push(t);}return {rows,idx,pos:new Map(idx.map((t,i)=>[t,i]))};}
export function run(panel){const {dates,series}=panel,D=dates.length,codes=[...series.keys()].filter(isCommon).sort(),monthFirst=new Set();let pm='';dates.forEach((d,t)=>{if(d.slice(0,7)!==pm){monthFirst.add(t);pm=d.slice(0,7);}});
 const out={},stats={excludedUnknown:0,delistExits:0};for(const k of Object.keys(SPEC.tests))out[k]=[];
 const adj=new Map();
 for(let t=SPEC.warmup;t<D-1;t++){const daily=true,monthly=monthFirst.has(t);const pool=[];
  for(const c of codes){const s=series.get(c);if(!eligible(s,t))continue;pool.push(c);}
  if(pool.length<50)continue;
  for(const [key,cfg] of Object.entries(SPEC.tests)){if(cfg.freq==='monthly'&&!monthly)continue;
   const rows=[];for(const c of pool){const s=series.get(c),fw=forward(s,t,cfg.hold,D);if(!fw)continue;if(fw.excluded){stats.excludedUnknown++;continue;}
    let score;if(key==='S0'){if(!adj.has(c))adj.set(c,adjustedRows(s,dates));const a=adj.get(c),i=a.pos.get(t);if(i===undefined||i<64){continue;}score=E.evaluate(a.rows.slice(Math.max(0,i-99),i+1)).eligible?1:0;}
    else{score=features(s,t)[key];if(!Number.isFinite(score))continue;}
    rows.push({c,score,r:fw.r,delist:fw.delistExit});}
   if(rows.length<50)continue;let top,rest;
   if(key==='S0'){top=rows.filter(x=>x.score===1);rest=rows.filter(x=>x.score!==1);if(!top.length)continue;}
   else{rows.sort((a,b)=>b.score-a.score||a.c.localeCompare(b.c));const n=Math.max(1,Math.floor(rows.length*SPEC.decile));top=rows.slice(0,n);rest=rows.slice(n);}
   const mean=xs=>xs.reduce((a,x)=>a+x.r,0)/xs.length;stats.delistExits+=top.filter(x=>x.delist).length;
   out[key].push({date:dates[t],excess:mean(top)-mean(rest),top:mean(top),n:top.length,universe:rows.length});}}
 return {series:out,stats};}
const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h;};
export function monthly(series){const m=new Map();for(const x of series){const k=x.date.slice(0,7),a=m.get(k)||[];a.push(x.excess);m.set(k,a);}return [...m.entries()].sort().map(([month,xs])=>({month,excess:xs.reduce((a,b)=>a+b,0)/xs.length}));}
export function interval(xs,key){const B=SPEC.blockMonths;if(xs.length<B*4)return null;let seed=hash(SPEC.version+'/'+key);const means=[];for(let b=0;b<SPEC.resamples;b++){let s=0,n=0;while(n<xs.length){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const st=seed%(xs.length-B+1);for(let k=0;k<B&&n<xs.length;k++,n++)s+=xs[st+k];}means.push(s/xs.length);}means.sort((a,b)=>a-b);const q=p=>means[Math.min(means.length-1,Math.max(0,Math.floor(p*means.length)))];return [q(SPEC.alpha/2),q(1-SPEC.alpha/2)];}
export function judge(series,key){const inP=(x,[a,b])=>x.date>=a&&x.date<=b,P=SPEC.periods,avg=xs=>xs.length?xs.reduce((a,x)=>a+x.excess,0)/xs.length:null;
 const parts=Object.fromEntries(Object.entries(P).map(([k,r])=>[k,series.filter(x=>inP(x,r))]));const testMonths=monthly(parts.test).map(x=>x.excess),ci=interval(testMonths,key);
 const m=Object.fromEntries(Object.entries(parts).map(([k,xs])=>[k,{formations:xs.length,from:xs[0]?.date||null,to:xs.at(-1)?.date||null,meanExcessPct:avg(xs)!==null?+(avg(xs)*100).toFixed(3):null,avgPicks:xs.length?+(xs.reduce((a,x)=>a+x.n,0)/xs.length).toFixed(1):null}]));
 const pass=m.design.meanExcessPct>0&&m.validation.meanExcessPct>0&&!!ci&&ci[0]>0,practical=pass&&m.test.meanExcessPct>SPEC.costPct;
 return {...m,testIntervalPct:ci?ci.map(x=>+(x*100).toFixed(3)):null,verdict:!ci?'樣本不足':practical?'通過，且超額大於來回成本（可能實用，需前瞻觀察）':pass?'通過，但超額小於來回成本':'未通過'};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),t0=Date.now(),panel=loadPanel(root),{series,stats}=run(panel);
 const result={spec:SPEC.version,dataRange:[panel.dates[0],panel.dates.at(-1)],stats,results:Object.fromEntries(Object.entries(SPEC.tests).map(([k,c])=>[k,{...c,...judge(series[k],k)}])),seconds:Math.round((Date.now()-t0)/1000)};
 const text=JSON.stringify(result,null,1);if(process.argv[2])fs.writeFileSync(process.argv[2],text+'\n');console.log(text);}
