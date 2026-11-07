// v4 (SPEC-v4.md): buy 0050 after a crash vs buying 0050 on any day. Signals use data <= t; enter at t+1 open, exit at t+H close.
// node research/factors-v4.mjs [out.json]
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadPanel} from './lib/data.mjs';
export const SPEC=Object.freeze({version:'v4',warmup:252,buyCost:0.001425+0.001,sellCost:0.001425+0.001+0.001,minEvents:8,alpha:0.05/3,draws:10000,seed:20261107,split:'2021-01-01',
 rules:[{id:'C1',name:'單日大跌',H:20},{id:'C2',name:'五日急跌',H:20},{id:'C3',name:'跌入修正',H:60}],
 nsf:[{n:7,date:'2020-03-19'},{n:8,date:'2022-07-12'},{n:9,date:'2025-04-08'}]});
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
// adjusted open/close on the same total-return scale
export function series0050(s){const D=s.tri.length,close=new Float64Array(D),open=new Float64Array(D);for(let t=0;t<D;t++){const f=s.c[t]>0?s.tri[t]/s.c[t]:NaN;close[t]=s.tri[t];open[t]=s.o[t]>0?s.o[t]*f:NaN;}return {close,open,unk:s.unk};}
export function signal(id,close,t,W=252){
 if(id==='C1')return close[t]/close[t-1]-1<=-0.05;
 if(id==='C2')return close[t]/close[t-5]-1<=-0.10;
 if(id==='C3'){const dd=i=>{let m=-Infinity;for(let k=Math.max(0,i-W+1);k<=i;k++)if(close[k]>m)m=close[k];return close[i]/m-1;};return dd(t)<=-0.15&&dd(t-1)>-0.15;}
 throw Error(id);}
// return of entering at t+1 open and exiting at t+H close, after costs; null if not matured or a price is missing
export function trade(px,t,H){const e=t+1,x=t+H;if(x>=px.close.length)return null;const o=px.open[e],c=px.close[x];if(!(o>0)||!(c>0))return null;
 let low=Infinity;for(let k=e;k<=x;k++)low=Math.min(low,px.close[k]);return {ret:(c*(1-SPEC.sellCost))/(o*(1+SPEC.buyCost))-1,maxDD:low/o-1};}
export function run(dates,px){const D=dates.length,out={rules:[],nsf:[]};
 for(const r of SPEC.rules){const events=[],pending=[];let busyUntil=-1;
  const base=[];for(let t=SPEC.warmup;t<D;t++){const tr=trade(px,t,r.H);if(tr)base.push({t,...tr});}
  for(let t=SPEC.warmup;t<D;t++){if(t<=busyUntil||!signal(r.id,px.close,t))continue;const tr=trade(px,t,r.H);busyUntil=t+r.H;
   if(tr)events.push({date:dates[t],entry:dates[t+1],exit:dates[t+r.H],ret:tr.ret,maxDD:tr.maxDD});else pending.push(dates[t]);}
  const mean=a=>a.reduce((x,y)=>x+y,0)/a.length,n=events.length,em=n?mean(events.map(e=>e.ret)):null,bm=mean(base.map(b=>b.ret));
  let p=null;if(n){const R=rng(SPEC.seed),B=base.map(b=>b.ret);let ge=0;for(let k=0;k<SPEC.draws;k++){const pick=new Set();while(pick.size<n)pick.add(Math.floor(R()*B.length));let s=0;for(const i of pick)s+=B[i];if(s/n>=em)ge++;}p=ge/SPEC.draws;}
  const half=lo=>{const ev=events.filter(e=>(e.date>=SPEC.split)===lo),bs=base.filter(b=>(dates[b.t]>=SPEC.split)===lo);return {events:ev.length,excess:ev.length?mean(ev.map(e=>e.ret))-mean(bs.map(b=>b.ret)):null};};
  const verdict=n<SPEC.minEvents?'樣本不足，無法判斷':(em-bm>0&&p<SPEC.alpha?'通過':'未通過');
  out.rules.push({...r,events,pending,n,eventMean:em,baseMean:bm,excess:n?em-bm:null,p,alpha:SPEC.alpha,verdict,
   eventWinRate:n?events.filter(e=>e.ret>0).length/n:null,baseWinRate:base.filter(b=>b.ret>0).length/base.length,worst:n?events.reduce((a,b)=>a.ret<b.ret?a:b):null,
   firstHalf:half(false),secondHalf:half(true),baseCount:base.length});}
 const di=new Map(dates.map((d,i)=>[d,i]));
 for(const e of SPEC.nsf){let t=di.get(e.date);const row={...e,tradingDate:t==null?null:dates[t]};for(const H of [20,60]){const tr=t==null?null:trade(px,t,H);let b=[];for(let k=SPEC.warmup;k<dates.length;k++){const x=trade(px,k,H);if(x)b.push(x.ret);}row['H'+H]=tr?{ret:tr.ret,maxDD:tr.maxDD,baseMean:b.reduce((x,y)=>x+y,0)/b.length}:null;}out.nsf.push(row);}
 return out;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),panel=loadPanel(root,{keep:c=>c==='0050'}),s=panel.series.get('0050'),px=series0050(s);
 const big=[];for(let t=1;t<px.close.length;t++){const r=px.close[t]/px.close[t-1]-1;if(Math.abs(r)>0.12)big.push([panel.dates[t],r,s.unk[t]]);}
 const result={spec:SPEC.version,dataFrom:panel.dates[0],dataTo:panel.dates.at(-1),days:panel.dates.length,unknownDays:[...s.unk].reduce((a,b)=>a+b,0),dailyMovesOver12pct:big,...run(panel.dates,px)};
 const text=JSON.stringify(result,null,1);if(process.argv[2])fs.writeFileSync(process.argv[2],text+'\n');console.log(text);}
