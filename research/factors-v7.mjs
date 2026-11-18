// SPEC-v7: buy 0050 after a drawdown of X% from the 252-day high vs buying on any day. node research/factors-v7.mjs
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadPanel} from './lib/data.mjs';import {prepare} from './factors-v2.mjs';
export const SPEC7=Object.freeze({tests:[{id:'T1',x:.05,h:60},{id:'T2',x:.10,h:60},{id:'T3',x:.15,h:60}],alpha:.05/3,draws:20000,seed:7,minEvents:8,testFrom:'2022-01-01',win:252,accountFrom:'2015-01-02',capital:100000});
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
export function series0050(panel){const s=panel.series.get('0050'),D=panel.dates.length,tri=[...s.tri].map(v=>v>0?v:NaN);
 for(let t=1;t<D;t++)if(!(tri[t]>0))tri[t]=tri[t-1];return {dates:panel.dates,tri};}
export function drawdown(tri,win){const dd=new Array(tri.length).fill(NaN);for(let t=win-1;t<tri.length;t++){let m=0;for(let k=t-win+1;k<=t;k++)if(tri[k]>m)m=tri[k];dd[t]=tri[t]/m-1;}return dd;}
const fwd=(tri,t,h)=>t+1+h<tri.length?tri[t+1+h]/tri[t+1]-1:NaN;
export function events(tri,dd,x,h){const ev=[];for(let t=0;t<tri.length;t++){if(!(dd[t]<=-x))continue;const r=fwd(tri,t,h);if(!Number.isFinite(r))continue;if(ev.length&&t-ev.at(-1).t<=h)continue;ev.push({t,r});}return ev;}
// random non-overlapping days (same count): pick sorted random positions with gaps > h by rejection
function drawDays(valid,n,h,rand){for(let tries=0;tries<200;tries++){const pick=[];const order=[];for(let i=0;i<n*6&&pick.length<n;i++){const t=valid[Math.floor(rand()*valid.length)];if(pick.every(p=>Math.abs(p-t)>h))pick.push(t);}if(pick.length===n)return pick;order.length=0;}return null;}
export function run(panel){const {dates,tri}=series0050(panel),dd=drawdown(tri,SPEC7.win),rand=rng(SPEC7.seed),out={spec:'SPEC-v7',through:dates.at(-1),tests:{}};
 const tf=dates.findIndex(d=>d>=SPEC7.testFrom);
 for(const T of SPEC7.tests){const valid=[];for(let t=SPEC7.win-1;t<tri.length;t++)if(Number.isFinite(fwd(tri,t,T.h)))valid.push(t);
  const mu=valid.reduce((a,t)=>a+fwd(tri,t,T.h),0)/valid.length,ev=events(tri,dd,T.x,T.h),mean=ev.length?ev.reduce((a,e)=>a+e.r,0)/ev.length:NaN;
  let ge=0,done=0;for(let i=0;i<SPEC7.draws&&ev.length;i++){const d=drawDays(valid,ev.length,T.h,rand);if(!d)continue;done++;const m=d.reduce((a,t)=>a+fwd(tri,t,T.h),0)/d.length;if(m>=mean)ge++;}
  const p=done?(ge+1)/(done+1):NaN,test=ev.filter(e=>e.t>=tf),testEx=test.length?test.reduce((a,e)=>a+e.r,0)/test.length-mu:NaN;
  const pass=p<SPEC7.alpha&&ev.length>=SPEC7.minEvents&&test.length>=2&&testEx>0;
  out.tests[T.id]={x:T.x,h:T.h,events:ev.length,meanPct:+(mean*100).toFixed(2),baselinePct:+(mu*100).toFixed(2),excessPct:+((mean-mu)*100).toFixed(2),winRate:ev.length?+(ev.filter(e=>e.r>0).length/ev.length*100).toFixed(1):null,p:+p.toFixed(4),draws:done,
   testEvents:test.length,testExcessPct:Number.isFinite(testEx)?+(testEx*100).toFixed(2):null,pass,dates:ev.map(e=>dates[e.t])};}
 // descriptive only: any-day 60-day holding
 {const h=60,v=[];for(let t=SPEC7.win-1;t<tri.length;t++){const r=fwd(tri,t,h);if(Number.isFinite(r))v.push(r);}out.anyDay60={n:v.length,meanPct:+(v.reduce((a,b)=>a+b,0)/v.length*100).toFixed(2),positivePct:+(v.filter(r=>r>0).length/v.length*100).toFixed(1)};}
 // descriptive accounts from accountFrom
 {const t0=dates.findIndex(d=>d>=SPEC7.accountFrom),N=tri.length-1,acc={cash:{end:SPEC7.capital,maxDrawdownPct:0}};
  const path=(start)=>{let peak=0,mdd=0;for(let t=start;t<=N;t++){const v=SPEC7.capital*tri[t]/tri[start];peak=Math.max(peak,v);mdd=Math.min(mdd,v/peak-1);}return {start:dates[start],end:Math.round(SPEC7.capital*tri[N]/tri[start]),maxDrawdownPct:+(mdd*100).toFixed(1)};};
  acc.buyDay1=path(t0+1);for(const T of SPEC7.tests){const t=dd.findIndex((v,i)=>i>=t0&&v<=-T.x);acc['waitDD'+T.x*100]=t>=0&&t<N?path(t+1):{start:null,end:SPEC7.capital,maxDrawdownPct:0};}out.accounts=acc;}
 out.passed=Object.entries(out.tests).filter(([,v])=>v.pass).map(([k])=>k);return out;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
 const r=run(prepare(loadPanel(root,{})));fs.writeFileSync(path.join(root,'research','results-v7.json'),JSON.stringify(r,null,1)+'\n');const {tests,...rest}=r;for(const [k,v] of Object.entries(tests)){const {dates,...x}=v;console.log(k,JSON.stringify(x));}console.log(JSON.stringify(rest));}
