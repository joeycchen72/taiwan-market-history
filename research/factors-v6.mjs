// v6 (SPEC-v6.md): small account, 6 stocks a month from the B2 list (revenue at a 12-month high), net of costs, versus holding 0050.
// node research/factors-v6.mjs [out.json]
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadPanel,isCommon} from './lib/data.mjs';import {forward} from './factors-v1.mjs';import {prepare} from './factors-v2.mjs';
import {SPEC3,loadB,groupsAt} from './factors-v3.mjs';import {decisionDates} from './factors-v3.1.mjs';import {formationDates} from '../scripts/fetch-b.mjs';
export const SPEC6=Object.freeze({version:'factors-v6',n:6,minPicks:3,costPct:0.785,hold:21,alpha:0.05/3,resamples:2000,blockMonths:3,seed:20261111,periods:SPEC3.periods,rules:['P1','P2','P3']});
const monthAdd=(m,k)=>{const [y,mo]=m.split('-').map(Number),d=new Date(Date.UTC(y,mo-1+k,1));return d.toISOString().slice(0,7);};
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
// ranking keys use data <= t only
export function keys(s,t,revRow){let hi=-Infinity;for(let k=Math.max(0,t-251);k<=t;k++)if(s.tri[k]>hi)hi=s.tri[k];const value20=t>=19?(s.cv[t+1]-s.cv[t-19])/20:NaN;
 return {P1:hi>0?s.tri[t]/hi:NaN,P2:revRow&&revRow.last_year_rev>0?revRow.rev/revRow.last_year_rev-1:NaN,P3:value20};}
export function pick(list,key,n=SPEC6.n){return list.filter(x=>Number.isFinite(x[key])).sort((a,b)=>b[key]-a[key]||a.c.localeCompare(b.c)).slice(0,n).map(x=>x.c);}
export function run(panel,B,fds){prepare(panel);const {dates,di,series}=panel,D=dates.length,codes=[...series.keys()].filter(isCommon).sort(),dd=decisionDates(dates,fds),etf=series.get('0050'),out={P1:[],P2:[],P3:[],B2all:[]},skipped=[];
 for(let i=0;i<fds.length;i++){const month=fds[i].month,dec=dd.get(month);if(!dec)continue;const t=di.get(dec);if(t===undefined||t<SPEC3.warmup||t+SPEC6.hold>=D)continue;
  const G=groupsAt(panel,B,fds,i,codes,dec);if(!G?.defs){skipped.push({month,why:'pool'});continue;}const d=G.defs.B2();if(!d||!d.g.size){skipped.push({month,why:'no B2'});continue;}
  const bench=forward(etf,t,SPEC6.hold,D);if(!bench||bench.excluded){skipped.push({month,why:'0050'});continue;}
  const rev=B('revenue',monthAdd(month,-1)),list=[...d.g].map(c=>({c,...keys(series.get(c),t,rev?.get(c))}));
  const ret=cs=>{const r=[];for(const c of cs){const f=forward(series.get(c),t,SPEC6.hold,D);if(f&&!f.excluded)r.push(f.r);}return r;};
  for(const k of SPEC6.rules){const cs=pick(list,k),r=ret(cs);if(r.length<SPEC6.minPicks){skipped.push({month,rule:k,why:'<3 valid'});continue;}
   out[k].push({date:dec,picks:cs,n:r.length,grossPct:mean(r)*100,benchPct:bench.r*100,excess:mean(r)*100-SPEC6.costPct-bench.r*100});}
  const all=ret([...d.g]);if(all.length)out.B2all.push({date:dec,n:all.length,excess:mean(all)*100-SPEC6.costPct-bench.r*100});}
 return {series:out,skipped};}
function ci(xs){if(xs.length<12)return null;const R=rng(SPEC6.seed),b=SPEC6.blockMonths,ms=[];for(let k=0;k<SPEC6.resamples;k++){const s=[];while(s.length<xs.length){const st=Math.floor(R()*(xs.length-b+1));for(let j=0;j<b&&s.length<xs.length;j++)s.push(xs[st+j]);}ms.push(mean(s));}ms.sort((a,b)=>a-b);const a=SPEC6.alpha/2;return [ms[Math.floor(a*ms.length)],ms[Math.ceil((1-a)*ms.length)-1]];}
export function judge(series){const inP=(d,[a,b])=>d>=a&&d<=b,m={};for(const [p,r] of Object.entries(SPEC6.periods)){const xs=series.filter(x=>inP(x.date,r));m[p]={months:xs.length,meanExcessPct:xs.length?+mean(xs.map(x=>x.excess)).toFixed(3):null};}
 const test=series.filter(x=>inP(x.date,SPEC6.periods.test)).map(x=>x.excess),c=ci(test),pass=m.design.meanExcessPct>0&&m.validation.meanExcessPct>0&&!!c&&c[0]>0;
 const g=series.map(x=>1+(x.grossPct-SPEC6.costPct)/100),b=series.map(x=>1+x.benchPct/100),years=series.length/12,prod=a=>a.reduce((x,y)=>x*y,1);
 let streak=0,worstStreak=0;for(const x of series){streak=x.excess<0?streak+1:0;worstStreak=Math.max(worstStreak,streak);}
 return {...m,testInterval:c?c.map(v=>+v.toFixed(3)):null,verdict:!c?'樣本不足':pass?'通過':'未通過',annualNetPct:series.length?+((prod(g)**(1/years)-1)*100).toFixed(2):null,annual0050Pct:series.length?+((prod(b)**(1/years)-1)*100).toFixed(2):null,
  longestLosingStreakVs0050:worstStreak,worstMonth:series.length?series.reduce((a,b)=>a.excess<b.excess?a:b):null,avgPicks:series.length?+mean(series.map(x=>x.n)).toFixed(2):null};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),panel=loadPanel(root),fds=formationDates(JSON.parse(fs.readFileSync(path.join(root,'data','progress.json'),'utf8'))),{series,skipped}=run(panel,loadB(root),fds);
 const result={spec:SPEC6.version,dataRange:[panel.dates[0],panel.dates.at(-1)],results:Object.fromEntries(SPEC6.rules.map(k=>[k,judge(series[k])])),reference:{B2all:judge(series.B2all.map(x=>({...x,grossPct:NaN,benchPct:NaN})))},series,skipped};
 const text=JSON.stringify(result,null,1);if(process.argv[2])fs.writeFileSync(process.argv[2],text+'\n');console.log(JSON.stringify(result.results,null,1));}
