// v5 (SPEC-v5.md): on market crash days, is selling a stock that broke down (sell at t close) worse than selling k days later?
// node research/factors-v5.mjs [out.json]
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadPanel,isCommon} from './lib/data.mjs';
export const SPEC=Object.freeze({version:'v5',warmup:252,crash:0.95,calm:0.98,stockDrop:0.93,minClose:10,minValue:2e7,ks:[1,5,20],minDays:8,alpha:0.05/3,draws:10000,seed:20261110,split:'2021-01-01'});
function rng(seed){let s=seed>>>0;return()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
// Reference price of day t, the same one buildIndex uses for the total-return index: the official reference on ex-rights /
// no-comparison days (x flag), otherwise close minus the published change. (Implementation note, 2026-11-10, before any
// return was computed: the stored `ref` field is filled only on x-flag days, so using it alone would drop almost every day.)
export const refPrice=(s,t)=>s.x?.[t]?s.ref[t]:(s.c[t]>0&&Number.isFinite(s.chg[t])?s.c[t]-s.chg[t]:NaN);
// day type from 0050 only, using data of day t
export function dayType(m,t){const ref=refPrice(m,t),low=m.l[t];if(!(ref>0)||!(low>0))return null;if(low<=ref*SPEC.crash)return 'crash';if(low>ref*SPEC.calm)return 'calm';return null;}
// stock qualifies on day t using data <= t only
export function qualifies(s,t){const ref=refPrice(s,t);if(!(ref>0)||!(s.l[t]>0)||!(s.c[t]>0)||!(s.l[t]<=ref*SPEC.stockDrop)||!(s.c[t-1]>=SPEC.minClose))return false;
 if(!s.nvalid){s.nvalid=new Int32Array(s.c.length+1);for(let k=0;k<s.c.length;k++)s.nvalid[k+1]=s.nvalid[k]+(s.c[k]>0?1:0);}if(s.nvalid[t]<SPEC.warmup)return false;
 let v=0;for(let k=t-20;k<t;k++){if(k<0||!(s.val[k]>=0))return false;v+=s.val[k];}return v/20>=SPEC.minValue;}
export function delta(s,t,k){if(t+k>=s.tri.length)return {skip:'unmatured'};for(let j=t+1;j<=t+k;j++)if(s.unk[j])return {skip:'unknown'};const a=s.tri[t],b=s.tri[t+k];if(!(a>0)||!(b>0))return {skip:'missing'};return {d:b/a-1};}
export function run(panel){const {dates,series}=panel,m=series.get('0050'),codes=[...series.keys()].filter(isCommon),D=dates.length,out={dayTypes:{crash:0,calm:0},skipped:{unmatured:0,unknown:0,missing:0},ks:{}};
 const perDay={crash:{},calm:{}};for(const k of SPEC.ks){perDay.crash[k]=[];perDay.calm[k]=[];}
 for(let t=SPEC.warmup;t<D;t++){const type=dayType(m,t);if(!type)continue;const picks=codes.filter(c=>qualifies(series.get(c),t));if(!picks.length)continue;out.dayTypes[type]++;
  for(const k of SPEC.ks){const ds=[];for(const c of picks){const r=delta(series.get(c),t,k);if(r.skip){out.skipped[r.skip]++;continue;}ds.push(r.d);}if(ds.length)perDay[type][k].push({date:dates[t],n:ds.length,mean:mean(ds)});}}
 for(const k of SPEC.ks){const cr=perDay.crash[k],ca=perDay.calm[k],cm=cr.length?mean(cr.map(x=>x.mean)):null,am=ca.length?mean(ca.map(x=>x.mean)):null;let p=null;
  if(cr.length){const R=rng(SPEC.seed+k),v=cr.map(x=>x.mean);let le=0;for(let i=0;i<SPEC.draws;i++){let s=0;for(let j=0;j<v.length;j++)s+=v[Math.floor(R()*v.length)];if(s/v.length<=0)le++;}p=le/SPEC.draws;}
  const half=lo=>{const a=cr.filter(x=>(x.date>=SPEC.split)===lo),b=ca.filter(x=>(x.date>=SPEC.split)===lo);return {crashDays:a.length,crashMean:a.length?mean(a.map(x=>x.mean)):null,calmMean:b.length?mean(b.map(x=>x.mean)):null};};
  const pass=cr.length>=SPEC.minDays&&cm>0&&p<SPEC.alpha&&cm-am>0;
  out.ks[k]={crashDays:cr.length,calmDays:ca.length,crashMean:cm,calmMean:am,diff:cm!=null&&am!=null?cm-am:null,p,alpha:SPEC.alpha,verdict:cr.length<SPEC.minDays?'樣本不足，無法判斷':pass?'通過':'未通過',
   crashNegativeShare:cr.length?cr.filter(x=>x.mean<0).length/cr.length:null,worst:cr.length?cr.reduce((a,b)=>a.mean<b.mean?a:b):null,firstHalf:half(false),secondHalf:half(true),crashByDay:cr};}
 return out;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),panel=loadPanel(root);
 const result={spec:SPEC.version,dataFrom:panel.dates[0],dataTo:panel.dates.at(-1),days:panel.dates.length,...run(panel)};
 const text=JSON.stringify(result,null,1);if(process.argv[2])fs.writeFileSync(process.argv[2],text+'\n');console.log(text.slice(0,200));}
