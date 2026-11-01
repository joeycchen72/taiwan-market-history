// SPEC-v3 (B-class). Pre-registered in research/SPEC-v3.md before this file was written and before B data finished downloading.
// Formation date f = first trading day on/after the 11th; groups decided with data public by the close of f; then forward returns (v1.1 rule).
// node research/factors-v3.mjs [out.json]
import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';import {fileURLToPath} from 'node:url';
import {loadPanel,isCommon} from './lib/data.mjs';
import {eligible,forward} from './factors-v1.mjs';
import {prepare} from './factors-v2.mjs';
import {formationDates} from '../scripts/fetch-b.mjs';
export const SPEC3=Object.freeze({version:'factors-v3',tests:11,alpha:0.05/11,resamples:2000,blockMonths:3,costPct:0.785,hold:21,warmup:252,
 periods:{design:['2014-01-01','2019-12-31'],validation:['2020-01-01','2022-12-31'],test:['2023-01-01','9999-12-31']}});
const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h;};
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null,pct=x=>x===null||!Number.isFinite(x)?null:+(x*100).toFixed(3);
function bootstrap(xs,key){const B=SPEC3.blockMonths;if(xs.length<B*4)return null;let seed=hash(SPEC3.version+'/'+key);const out=[];
 for(let b=0;b<SPEC3.resamples;b++){let s=0,n=0;while(n<xs.length){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const st=seed%(xs.length-B+1);for(let k=0;k<B&&n<xs.length;k++,n++)s+=xs[st+k];}out.push(s/xs.length);}
 out.sort((a,b)=>a-b);const q=p=>out[Math.min(out.length-1,Math.max(0,Math.floor(p*out.length)))];return [q(SPEC3.alpha/2),q(1-SPEC3.alpha/2)];}
export function judge(series,key){const inP=(d,[a,b])=>d>=a&&d<=b,m={};for(const [p,r] of Object.entries(SPEC3.periods)){const xs=series.filter(x=>inP(x.date,r));m[p]={formations:xs.length,meanPct:pct(mean(xs.map(x=>x.excess))),avgPicks:xs.length?+mean(xs.map(x=>x.n)).toFixed(1):null};}
 const ci=bootstrap(series.filter(x=>inP(x.date,SPEC3.periods.test)).map(x=>x.excess),key),pass=m.design.meanPct>0&&m.validation.meanPct>0&&!!ci&&ci[0]>0;
 return {...m,testIntervalPct:ci?ci.map(pct):null,verdict:!ci?'樣本不足':!pass?'未通過':m.test.meanPct>SPEC3.costPct?'通過，且超額大於來回成本（可能實用，需前瞻觀察）':'通過，但超額小於來回成本'};}
// ---------- B data ----------
const num=v=>v===''||v===undefined?NaN:Number(v);
function readCsv(p){const lines=zlib.gunzipSync(fs.readFileSync(p)).toString().split('\n').filter(Boolean),h=lines[0].split(',');return lines.slice(1).map(l=>{const r=l.split(','),o={};h.forEach((k,i)=>o[k]=k==='code'||k==='industry'?r[i]:num(r[i]));return o;});}
export function loadB(root){const base=path.join(root,'data','b'),get=(kind,key)=>{const ms=kind==='revenue'?['sii','otc']:['twse','tpex'],m=new Map();let any=false;for(const mk of ms){const p=path.join(base,kind+'-'+mk,key.slice(0,4),key+'.csv.gz');if(!fs.existsSync(p))continue;any=true;for(const r of readCsv(p))m.set(r.code,r);}return any?m:null;};
 const cache=new Map(),g=(kind,key)=>{const k=kind+'|'+key;if(!cache.has(k))cache.set(k,get(kind,key));return cache.get(k);};return g;}
const monthAdd=(m,d)=>{const [y,mo]=m.split('-').map(Number);return new Date(Date.UTC(y,mo-1+d,1)).toISOString().slice(0,7);};
// ---------- engine ----------
export function run(panel,B,fds){prepare(panel);const {dates,di,series}=panel,D=dates.length,codes=[...series.keys()].filter(isCommon).sort(),out={},stats={};
 const tests=['B1','B2','B3','B4','B5','B6','B7','B8','B9','B10','B11'];for(const k of tests){out[k]=[];stats[k]={excluded:0,noNextOpen:0,dropped:0,skippedNoData:0};}
 const topShare=(xs,share,asc=false)=>{const v=xs.filter(x=>Number.isFinite(x.v)).sort((a,b)=>(asc?a.v-b.v:b.v-a.v)||a.c.localeCompare(b.c));return new Set(v.slice(0,Math.max(1,Math.floor(v.length*share))).map(x=>x.c));};
 for(let i=0;i<fds.length;i++){const {month,date}=fds[i],t=di.get(date);if(t===undefined||t<SPEC3.warmup||t+SPEC3.hold>=D)continue;
  const prevF=i>0?fds[i-1].date:null,rm=monthAdd(month,-1);
  const rev=B('revenue',rm),qf=B('qfii',date),qf0=prevF?B('qfii',prevF):null,mg=B('margin',date),mg0=prevF?B('margin',prevF):null,pe=B('pe',date);
  const pool=codes.filter(c=>eligible(series.get(c),t));if(pool.length<50)continue;
  const has=(m,c)=>!!m&&m.has(c);
  const defs={
   B1:()=>{if(!rev)return null;const p=pool.filter(c=>has(rev,c)&&rev.get(c).last_year_rev>0);return {p,g:topShare(p.map(c=>({c,v:rev.get(c).rev/rev.get(c).last_year_rev-1})),0.1)};},
   B2:()=>{if(!rev)return null;const hist=[];for(let k=2;k<=13;k++){const m=B('revenue',monthAdd(month,-k));if(!m)return null;hist.push(m);}const p=pool.filter(c=>has(rev,c)&&hist.every(m=>m.has(c)&&Number.isFinite(m.get(c).rev)));return {p,g:new Set(p.filter(c=>hist.every(m=>rev.get(c).rev>=m.get(c).rev)))};},
   B3:()=>{if(!rev)return null;const p=pool.filter(c=>has(rev,c)&&rev.get(c).last_cum_rev>0);return {p,g:topShare(p.map(c=>({c,v:rev.get(c).cum_rev/rev.get(c).last_cum_rev-1})),0.1)};},
   B4:()=>{if(!qf||!qf0)return null;const p=pool.filter(c=>has(qf,c)&&has(qf0,c)&&Number.isFinite(qf.get(c).foreign_pct)&&Number.isFinite(qf0.get(c).foreign_pct));return {p,g:topShare(p.map(c=>({c,v:qf.get(c).foreign_pct-qf0.get(c).foreign_pct})),0.1)};},
   B5:()=>{if(!mg||!mg0)return null;const p=pool.filter(c=>has(mg,c)&&has(mg0,c)&&mg0.get(c).margin_lots>=100&&Number.isFinite(mg.get(c).margin_lots));return {p,g:topShare(p.map(c=>({c,v:mg.get(c).margin_lots/mg0.get(c).margin_lots-1})),0.1,true)};},
   B6:()=>{if(!pe)return null;const p=pool.filter(c=>has(pe,c)&&pe.get(c).pe>0);return {p,g:topShare(p.map(c=>({c,v:pe.get(c).pe})),0.1,true)};},
   B7:()=>{if(!pe)return null;const p=pool.filter(c=>has(pe,c)&&Number.isFinite(pe.get(c).yield));return {p,g:topShare(p.map(c=>({c,v:pe.get(c).yield})),0.1)};},
   B8:()=>{if(!pe)return null;const p=pool.filter(c=>has(pe,c)&&pe.get(c).pb>0);return {p,g:topShare(p.map(c=>({c,v:pe.get(c).pb})),0.1,true)};},
   B9:()=>{if(!qf)return null;const p=pool.filter(c=>has(qf,c)&&qf.get(c).issued>0);return {p,g:topShare(p.map(c=>({c,v:qf.get(c).issued*series.get(c).c[t]})),0.1,true)};},
   B10:()=>{if(!rev||!pe)return null;const p=pool.filter(c=>has(rev,c)&&rev.get(c).last_year_rev>0&&has(pe,c)&&pe.get(c).pe>0);const a=topShare(p.map(c=>({c,v:rev.get(c).rev/rev.get(c).last_year_rev-1})),0.3),b=topShare(p.map(c=>({c,v:pe.get(c).pe})),0.3,true);return {p,g:new Set(p.filter(c=>a.has(c)&&b.has(c)))};},
   B11:()=>{if(!rev||t<63)return null;const p=pool.filter(c=>has(rev,c)&&series.get(c).tri[t-63]>0&&series.get(c).tri[t]>0);const by=new Map();for(const c of p){const ind=rev.get(c).industry;(by.get(ind)||by.set(ind,[]).get(ind)).push(series.get(c).tri[t]/series.get(c).tri[t-63]-1);}
    const best=[...by.entries()].filter(([,v])=>v.length>=5).map(([k,v])=>({k,r:mean(v)})).sort((a,b)=>b.r-a.r||a.k.localeCompare(b.k)).slice(0,3).map(x=>x.k);return {p,g:new Set(p.filter(c=>best.includes(rev.get(c).industry))),industries:best};}};
  for(const k of tests){const d=defs[k]();if(!d||d.p.length<50||!d.g.size){stats[k].skippedNoData++;continue;}
   const a=[],b=[];for(const c of d.p){const fw=forward(series.get(c),t,SPEC3.hold,D),g=d.g.has(c);if(!fw){stats[k].noNextOpen++;if(g)stats[k].dropped++;continue;}if(fw.excluded){stats[k].excluded++;if(g)stats[k].dropped++;continue;}(g?a:b).push(fw.r);}
   if(!a.length||!b.length)continue;out[k].push({date,excess:mean(a)-mean(b),n:a.length,selected:d.g.size,universe:d.p.length,...(d.industries?{industries:d.industries}:{})});}}
 return {series:out,stats};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),t0=Date.now(),panel=loadPanel(root),daily=JSON.parse(fs.readFileSync(path.join(root,'data','progress.json'),'utf8')),fds=formationDates(daily),B=loadB(root),{series,stats}=run(panel,B,fds);
 const names={B1:'營收年增最高',B2:'營收創12個月新高',B3:'累計營收年增最高',B4:'外資加碼',B5:'融資退場',B6:'低本益比',B7:'高殖利率',B8:'低股價淨值比',B9:'小市值',B10:'營收成長＋便宜',B11:'強勢產業'};
 const result={spec:SPEC3.version,alpha:SPEC3.alpha,dataRange:[panel.dates[0],panel.dates.at(-1)],formationDates:fds.length,results:Object.fromEntries(Object.keys(series).map(k=>[k,{name:names[k],...judge(series[k],k),stats:stats[k],lastIndustries:series[k].at(-1)?.industries}])),seconds:Math.round((Date.now()-t0)/1000)};
 const text=JSON.stringify(result,null,1);if(process.argv[2])fs.writeFileSync(process.argv[2],text+'\n');console.log(text);}
