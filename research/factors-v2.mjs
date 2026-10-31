// SPEC-v2 (A-class, existing daily data). Pre-registered in research/SPEC-v2.md before this file was written.
// Every condition is decided with data <= t; forward returns are looked at only afterwards (v1.1 rule).
// node research/factors-v2.mjs [out.json]
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadPanel,isCommon} from './lib/data.mjs';
import {SPEC as V1,features,eligible,forward} from './factors-v1.mjs';
export const SPEC2=Object.freeze({version:'factors-v2',tests:14,alpha:0.05/14,resamples:2000,blockMonths:3,blockDays:20,costPct:0.785,etfCostPct:0.585,periods:V1.periods,warmup:252,
 fee:0.001425,minFee:20,slip:0.001,tax:0.003,etfTax:0.001,capital:100000,a1Picks:5,a1MinValue:5e7,a16Monthly:10000});
const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h;};
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
// ---------- statistics ----------
function bootstrap(xs,key,B,stat=m=>mean(m)){if(xs.length<B*4)return null;let seed=hash(SPEC2.version+'/'+key);const out=[];
 for(let b=0;b<SPEC2.resamples;b++){const pick=[];while(pick.length<xs.length){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const st=seed%(xs.length-B+1);for(let k=0;k<B&&pick.length<xs.length;k++)pick.push(xs[st+k]);}out.push(stat(pick));}
 out.sort((a,b)=>a-b);const q=p=>out[Math.min(out.length-1,Math.max(0,Math.floor(p*out.length)))];return [q(SPEC2.alpha/2),q(1-SPEC2.alpha/2)];}
const inP=(d,[a,b])=>d>=a&&d<=b,pct=x=>x===null||x===undefined||!Number.isFinite(x)?null:+(x*100).toFixed(3);
const verdict=(m,ci,cost)=>{const pass=m.design.meanPct>0&&m.validation.meanPct>0&&!!ci&&ci[0]>0;if(!ci)return '樣本不足';if(!pass)return '未通過';if(cost==='net')return '通過（已扣成本）';if(cost===null)return '通過（日曆效應；能否交易需另評估）';return m.test.meanPct>cost?'通過，且超額大於來回成本（可能實用，需前瞻觀察）':'通過，但超額小於來回成本';};
// cross-sectional: series of {date,excess,n}; interval on monthly means (as v1)
function judgeCross(series,key,cost=SPEC2.costPct){const m={};for(const [p,r] of Object.entries(SPEC2.periods)){const xs=series.filter(x=>inP(x.date,r));m[p]={formations:xs.length,meanPct:pct(mean(xs.map(x=>x.excess))),avgPicks:xs.length?+mean(xs.map(x=>x.n)).toFixed(1):null};}
 const mo=new Map();for(const x of series.filter(x=>inP(x.date,SPEC2.periods.test))){const k=x.date.slice(0,7);(mo.get(k)||mo.set(k,[]).get(k)).push(x.excess);}
 const ci=bootstrap([...mo.entries()].sort().map(([,v])=>mean(v)),key,SPEC2.blockMonths);return {...m,testIntervalPct:ci?ci.map(pct):null,verdict:verdict(m,ci,cost)};}
// monthly strategy vs benchmark: series of {month,excess,...}
function judgeMonthly(rows,key,cost){const m={};for(const [p,r] of Object.entries(SPEC2.periods)){const xs=rows.filter(x=>inP(x.month+'-15',r));m[p]={months:xs.length,meanPct:pct(mean(xs.map(x=>x.excess))),beatShare:xs.length?+(xs.filter(x=>x.excess>0).length/xs.length).toFixed(3):null};}
 const ci=bootstrap(rows.filter(x=>inP(x.month+'-15',SPEC2.periods.test)).map(x=>x.excess),key,SPEC2.blockMonths);return {...m,testIntervalPct:ci?ci.map(pct):null,verdict:verdict(m,ci,cost)};}
// calendar: daily rows {date,r,ev}; statistic = mean(event) - mean(non-event), 20-day blocks
function judgeCalendar(rows,key){const diff=xs=>{const a=xs.filter(x=>x.ev).map(x=>x.r),b=xs.filter(x=>!x.ev).map(x=>x.r);return a.length&&b.length?mean(a)-mean(b):0;};const m={};
 for(const [p,r] of Object.entries(SPEC2.periods)){const xs=rows.filter(x=>inP(x.date,r));m[p]={days:xs.length,eventDays:xs.filter(x=>x.ev).length,meanPct:pct(diff(xs))};}
 const ci=bootstrap(rows.filter(x=>inP(x.date,SPEC2.periods.test)),key,SPEC2.blockDays,diff);return {...m,testIntervalPct:ci?ci.map(pct):null,verdict:verdict(m,ci,null)};}
// ---------- per-stock helpers ----------
export function prepare(panel){const {dates,series}=panel,D=dates.length;
 for(const s of series.values()){const f=t=>s.c[t]>0?s.tri[t]/s.c[t]:NaN;s.ao=new Float64Array(D).fill(NaN);s.ah=new Float64Array(D).fill(NaN);s.al=new Float64Array(D).fill(NaN);s.r=new Float64Array(D).fill(NaN);s.cv=new Float64Array(D+1);s.ex=new Uint8Array(D);s.refRaw=new Float64Array(D).fill(NaN);
  let prevTri=NaN;for(let t=0;t<D;t++){const k=f(t);if(k>0){s.ao[t]=s.o[t]*k;s.ah[t]=s.h[t]*k;s.al[t]=s.l[t]*k;if(prevTri>0&&!s.unk[t])s.r[t]=s.tri[t]/prevTri-1;prevTri=s.tri[t];}
   s.cv[t+1]=s.cv[t]+(s.val[t]>0?s.val[t]:0);if(s.x[t]&&s.ref[t]>0)s.ex[t]=1;s.refRaw[t]=s.x[t]?s.ref[t]:s.c[t]-s.chg[t];}}
 return panel;}
const avgVal=(s,a,b)=>a<0?NaN:(s.cv[b+1]-s.cv[a])/(b-a+1);
// ---------- cross-sectional engine ----------
function cross(panel,{formation,hold,condition,prep}){const {dates,series,codes}=panel,D=dates.length,out=[],stats={excluded:0,noNextOpen:0,dropped:0};
 for(let t=SPEC2.warmup;t<D-1;t++){if(!formation(t))continue;if(t+hold>=D)continue;const pool=codes.filter(c=>eligible(series.get(c),t));if(pool.length<50)continue;
  const ctx=prep?prep(t,pool):null;if(ctx===false)continue;const group=new Set(pool.filter(c=>condition(series.get(c),t,ctx,c)));if(!group.size)continue;
  const a=[],b=[];for(const c of pool){const fw=forward(series.get(c),t,hold,D),g=group.has(c);if(!fw){stats.noNextOpen++;if(g)stats.dropped++;continue;}if(fw.excluded){stats.excluded++;if(g)stats.dropped++;continue;}(g?a:b).push(fw.r);}
  if(!a.length||!b.length)continue;out.push({date:dates[t],excess:mean(a)-mean(b),n:a.length,selected:group.size,universe:pool.length});}
 return {series:out,stats};}
const decileTop=(pool,score,share=0.1)=>{const xs=pool.map(c=>({c,v:score(c)})).filter(x=>Number.isFinite(x.v)).sort((a,b)=>b.v-a.v||a.c.localeCompare(b.c));return new Set(xs.slice(0,Math.max(1,Math.floor(xs.length*share))).map(x=>x.c));};
const quantile=(vs,q)=>{const xs=vs.filter(Number.isFinite).sort((a,b)=>a-b);return xs.length?xs[Math.min(xs.length-1,Math.floor(q*xs.length))]:NaN;};
export function crossTests(panel){const {dates,series}=panel,D=dates.length,monthFirst=new Set();let pm='';dates.forEach((d,t)=>{if(d.slice(0,7)!==pm){monthFirst.add(t);pm=d.slice(0,7);}});
 const M=t=>monthFirst.has(t),EVERY=()=>true,S=c=>series.get(c);
 const lastClose=(s,t)=>{for(let k=t;k>=0;k--)if(s.c[k]>0)return {k,c:s.c[k]};return null;};
 const marketRet=(t,pool)=>mean(pool.map(c=>S(c).r[t]).filter(Number.isFinite));
 return {
  A2:cross(panel,{formation:M,hold:21,prep:(t,pool)=>({top:decileTop(pool,c=>features(S(c),t).H5)}),condition:(s,t,ctx,c)=>ctx.top.has(c)&&avgVal(s,t-79,t-20)>0&&avgVal(s,t-19,t)/avgVal(s,t-79,t-20)>=1.5}),
  A3:cross(panel,{formation:M,hold:21,condition:(s,t)=>{let hi=0,at=-1;for(let k=t-251;k<=t;k++)if(s.ah[k]>hi){hi=s.ah[k];at=k;}if(!(hi>0)||at<t-59)return false;const q=s.tri[t]/hi;return q>=0.90&&q<=0.95;}}),
  A4:cross(panel,{formation:EVERY,hold:20,prep:(t,pool)=>{const rng=new Map();for(const c of pool){const s=S(c);let hh=0,ll=Infinity;for(let k=t-120;k<t;k++){if(s.ah[k]>hh)hh=s.ah[k];if(s.al[k]>0&&s.al[k]<ll)ll=s.al[k];}if(hh>0&&ll<Infinity)rng.set(c,{hh,r:hh/ll-1});}return {rng,cut:quantile([...rng.values()].map(x=>x.r),0.2)};},
   condition:(s,t,ctx,c)=>{const x=ctx.rng.get(c);return !!x&&x.r<=ctx.cut&&s.tri[t]>x.hh;}}),
  A5:cross(panel,{formation:EVERY,hold:5,condition:(s,t)=>{for(let k=t+1;k<=Math.min(D-1,t+5);k++)if(s.ex[k])return true;return false;}}),
  A6:cross(panel,{formation:M,hold:21,condition:(s,t)=>{for(let e=t-4;e>=t-59;e--){if(!s.ex[e])continue;const pre=lastClose(s,e-1);if(!pre)return false;for(let k=e;k<=e+4;k++)if(s.c[k]>0&&s.c[k]>=pre.c)return true;return false;}return false;}}),
  A9:cross(panel,{formation:EVERY,hold:20,condition:(s,t)=>s.al[t]>0&&s.ah[t-1]>0&&s.al[t]>s.ah[t-1]*1.02&&s.c[t]>=s.o[t]}),
  A11:cross(panel,{formation:EVERY,hold:20,prep:(t,pool)=>{const m=marketRet(t,pool);if(!(m<=-0.03))return false;return {top:decileTop(pool,c=>S(c).r[t])};},condition:(s,t,ctx,c)=>ctx.top.has(c)}),
  A12:cross(panel,{formation:M,hold:21,prep:(t,pool)=>({low:decileTop(pool,c=>-avgVal(S(c),t-19,t))}),condition:(s,t,ctx,c)=>ctx.low.has(c)}),
  A13:cross(panel,{formation:EVERY,hold:20,condition:(s,t)=>{if(t<256)return false;const v5=avgVal(s,t-4,t),v60=avgVal(s,t-64,t-5),v192=avgVal(s,t-256,t-65);return v60>0&&v192>0&&v5/v60>=2&&v60/v192<=0.7;}}),
  A14:cross(panel,{formation:EVERY,hold:5,condition:(s,t)=>{const ref=s.refRaw[t];if(!(s.c[t]>0&&ref>0))return false;return s.c[t]/ref-1>=(dates[t]>='2015-06-01'?0.095:0.065);}})};}
// ---------- A1: small account, top-5 H5, odd lots, real costs ----------
export function a1(panel){const {dates,series,codes}=panel,D=dates.length,P=SPEC2,b=series.get('0050'),firsts=[];let pm='';dates.forEach((d,t)=>{if(d.slice(0,7)!==pm){firsts.push(t);pm=d.slice(0,7);}});
 const fee=v=>Math.max(P.minFee,v*P.fee);let cash=P.capital,pos=[];const nav=new Float64Array(D).fill(NaN),picksLog=[];let started=-1;
 const lastIdx=(s,t)=>{for(let k=t;k>=0;k--)if(s.tri[k]>0&&s.c[k]>0)return k;return -1;};
 const value=(p,t)=>{const s=series.get(p.code),k=lastIdx(s,t);return k<0?0:p.shares*p.rawEntry*(s.tri[k]/p.adjEntry);};
 for(let t=0;t<D;t++){const f=firsts.indexOf(t-1)>=0&&t-1>=P.warmup?t-1:-1;
  if(f>=0){// decide at close f (data <= f), trade at open t
   const pool=codes.filter(c=>{const s=series.get(c);return eligible(s,f)&&avgVal(s,f-19,f)>=P.a1MinValue;});
   const top=pool.map(c=>({c,v:features(series.get(c),f).H5})).filter(x=>Number.isFinite(x.v)).sort((x,y)=>y.v-x.v||x.c.localeCompare(y.c)).slice(0,P.a1Picks).map(x=>x.c);
   // sell everything at today's open (or last price if not traded)
   for(const p of pos){const s=series.get(p.code);let v;if(s.ao[t]>0){v=p.shares*p.rawEntry*(s.ao[t]/p.adjEntry);}else v=value(p,t-1);const net=v-fee(v)-v*P.tax-v*P.slip;cash+=net;}pos=[];
   const alloc=cash/P.a1Picks;for(const c of top){const s=series.get(c);if(!(s.o[t]>0&&s.ao[t]>0))continue;const px=s.o[t]*(1+P.slip);const sh=Math.floor((alloc-P.minFee)/(px*(1+P.fee)));if(sh<1)continue;const cost=sh*px;const tot=cost+fee(cost);if(tot>cash)continue;cash-=tot;pos.push({code:c,shares:sh,rawEntry:s.o[t],adjEntry:s.ao[t]});}
   picksLog.push({date:dates[f],picks:top});if(started<0)started=t;}
  if(started>=0)nav[t]=cash+pos.reduce((a,p)=>a+value(p,t),0);}
 const rows=monthlyVs(dates,nav,b.tri,started);return {rows,stats:{rebalances:picksLog.length,firstTrade:dates[started],finalNav:Math.round(nav[D-1]),cagrPct:cagr(nav,started,D-1,dates),bench:cagr(b.tri,started,D-1,dates),maxDrawdownPct:maxDD(nav,started),benchMaxDrawdownPct:maxDD(b.tri,started)},lastPicks:picksLog.at(-1)};}
function monthlyVs(dates,nav,bench,start){const ends=[];for(let t=start;t<dates.length;t++){if(t===dates.length-1||dates[t+1].slice(0,7)!==dates[t].slice(0,7))ends.push(t);}const rows=[];
 for(let i=1;i<ends.length;i++){const a=ends[i-1],z=ends[i];if(!(nav[a]>0&&nav[z]>0&&bench[a]>0&&bench[z]>0))continue;const s=nav[z]/nav[a]-1,bb=bench[z]/bench[a]-1;rows.push({month:dates[z].slice(0,7),strategy:s,bench:bb,excess:s-bb});}return rows;}
const cagr=(x,a,z,dates)=>{const y=(Date.parse(dates[z])-Date.parse(dates[a]))/31557600000;return x[a]>0&&x[z]>0&&y>0?+((Math.pow(x[z]/x[a],1/y)-1)*100).toFixed(2):null;};
const maxDD=(x,a)=>{let pk=0,dd=0;for(let t=a;t<x.length;t++){if(!(x[t]>0))continue;if(x[t]>pk)pk=x[t];dd=Math.min(dd,x[t]/pk-1);}return +(dd*100).toFixed(2);};
// ---------- A15: 0050 200-day moving-average timing ----------
export function a15(panel){const {dates}=panel,b=panel.series.get('0050'),D=dates.length,P=SPEC2,buyC=P.fee+P.slip,sellC=P.fee+P.slip+P.etfTax;
 let start=-1;for(let t=0;t<D;t++){let n=0;for(let k=t-199;k<=t&&k>=0;k++)if(b.tri[k]>0)n++;if(n===200){start=t;break;}}
 const nav=new Float64Array(D).fill(NaN);let v=1,inMkt=false,switches=0;nav[start]=v;
 for(let t=start+1;t<D;t++){let sum=0;for(let k=t-200;k<=t-1;k++)sum+=b.tri[k];const want=b.tri[t-1]>sum/200;
  if(want&&!inMkt){v*=(1-buyC)*(b.tri[t]/b.ao[t]>0?b.tri[t]/b.ao[t]:1);inMkt=true;switches++;}
  else if(!want&&inMkt){v*=(b.ao[t]>0?b.ao[t]/b.tri[t-1]:1)*(1-sellC);inMkt=false;switches++;}
  else if(inMkt)v*=b.tri[t]/b.tri[t-1];nav[t]=v;}
 const rows=monthlyVs(dates,nav,b.tri,start);return {rows,stats:{from:dates[start],switches,cagrPct:cagr(nav,start,D-1,dates),bench:cagr(b.tri,start,D-1,dates),maxDrawdownPct:maxDD(nav,start),benchMaxDrawdownPct:maxDD(b.tri,start)}};}
// ---------- A7 / A8: calendar effects on 0050 ----------
export function calendar(panel){const {dates}=panel,b=panel.series.get('0050'),D=dates.length,rows7=[],rows8=[];
 const weekdaysBetween=(a,z)=>{let n=0;for(let t=Date.parse(a+'T00:00:00Z')+86400000;t<Date.parse(z+'T00:00:00Z');t+=86400000){const w=new Date(t).getUTCDay();if(w>0&&w<6)n++;}return n;};
 for(let t=SPEC2.warmup;t<D;t++){if(!(b.tri[t]>0&&b.tri[t-1]>0))continue;const r=b.tri[t]/b.tri[t-1]-1,m=dates[t].slice(0,7);
  let first=0;for(let k=t;k>=0&&dates[k].slice(0,7)===m;k--)first++;const lastOfMonth=t===D-1?false:dates[t+1].slice(0,7)!==m;
  rows7.push({date:dates[t],r,ev:lastOfMonth||first<=3});
  if(t<D-1)rows8.push({date:dates[t],r,ev:weekdaysBetween(dates[t],dates[t+1])>=3});}
 return {A7:rows7,A8:rows8};}
// ---------- A16: DCA vs buying the dip (descriptive) ----------
export function a16(panel){const {dates}=panel,b=panel.series.get('0050'),D=dates.length,P=SPEC2;let pm='';const firsts=[];dates.forEach((d,t)=>{if(d.slice(0,7)!==pm){firsts.push(t);pm=d.slice(0,7);}});
 const buy=(st,t,amt)=>{const px=b.o[t]*(1+P.slip);if(!(px>0))return;const sh=Math.floor((amt-P.minFee)/(px*(1+P.fee)));if(sh<1)return;const c=sh*px,tot=c+Math.max(P.minFee,c*P.fee);st.cash-=tot;st.units+=sh*(b.o[t]/b.ao[t]);/* units in total-return-index terms: shares x (price / index) at entry */};
 const A={cash:0,units:0,put:0,nav:[]},B={cash:0,units:0,put:0,nav:[],dips:0},start=firsts.find(t=>t>=P.warmup);
 for(let t=start;t<D;t++){if(firsts.includes(t)){for(const s of [A,B]){s.cash+=P.a16Monthly;s.put+=P.a16Monthly;}buy(A,t,A.cash);buy(B,t,P.a16Monthly/2);}
  if(t>0){let hi=0;for(let k=Math.max(0,t-252);k<=t-1;k++)if(b.tri[k]>hi)hi=b.tri[k];if(b.tri[t-1]/hi-1<=-0.10&&B.cash>P.minFee*10){buy(B,t,B.cash);B.dips++;}}
  for(const s of [A,B])s.nav.push(s.cash+s.units*b.tri[t]);}
 const f=s=>({invested:s.put,final:Math.round(s.nav.at(-1)),gainPct:+((s.nav.at(-1)/s.put-1)*100).toFixed(2),cashLeft:Math.round(s.cash)});
 return {from:dates[start],to:dates[D-1],dca:f(A),dip:{...f(B),dipBuys:B.dips},note:'只有一條歷史路徑，不做統計判定；含手續費（最低20元）與滑價，未計賣出成本'};}
// ---------- main ----------
export function runAll(panel){prepare(panel);panel.codes=[...panel.series.keys()].filter(isCommon).sort();
 const cross=crossTests(panel),results={};for(const [k,v] of Object.entries(cross))results[k]={...judgeCross(v.series,k),stats:v.stats};
 const r1=a1(panel);results.A1={...judgeMonthly(r1.rows,'A1','net'),stats:r1.stats,lastPicks:r1.lastPicks};
 const r15=a15(panel);results.A15={...judgeMonthly(r15.rows,'A15','net'),stats:r15.stats};
 const cal=calendar(panel);results.A7=judgeCalendar(cal.A7,'A7');results.A8=judgeCalendar(cal.A8,'A8');
 results.A16=a16(panel);return results;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),t0=Date.now(),panel=loadPanel(root),results=runAll(panel);
 const out={spec:SPEC2.version,dataRange:[panel.dates[0],panel.dates.at(-1)],alpha:SPEC2.alpha,results,seconds:Math.round((Date.now()-t0)/1000)};const text=JSON.stringify(out,null,1);if(process.argv[2])fs.writeFileSync(process.argv[2],text+'\n');console.log(text);}
