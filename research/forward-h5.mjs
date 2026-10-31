// Forward (out-of-sample) observation of H5 "near 52-week high" from SPEC-v1 / factors-v1.
// Seals each month's list right after the first trading day's close is downloaded and BEFORE the next session opens,
// then evaluates matured lists. Never seals a list after the next day's data exists (no hindsight).
// node research/forward-h5.mjs [--now ISO]
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadPanel,isCommon} from './lib/data.mjs';
import {SPEC,features,eligible,forward} from './factors-v1.mjs';
export const FWD=Object.freeze({version:'forward-h5-v1',basedOn:'factors-v1 H5',startMonth:'2026-11',hold:21,decile:SPEC.decile,benchmark:'0050'});
const nextWeekday=d=>{let t=Date.parse(d+'T00:00:00Z');do{t+=86400000;}while([0,6].includes(new Date(t).getUTCDay()));return new Date(t).toISOString().slice(0,10);};
// latest instant a list for formation date d may be sealed: 09:00 Taipei of the next weekday (conservative if that day is a holiday)
export const sealDeadline=d=>Date.parse(nextWeekday(d)+'T09:00:00+08:00');
export function pick(panel,t){const {series}=panel,pool=[],rows=[];
 for(const c of [...series.keys()].filter(isCommon).sort()){const s=series.get(c);if(!eligible(s,t))continue;pool.push(c);const f=features(s,t).H5;if(Number.isFinite(f))rows.push({code:c,h5:f,close:s.c[t]});}
 rows.sort((a,b)=>b.h5-a.h5||a.code.localeCompare(b.code));const n=Math.max(1,Math.floor(rows.length*FWD.decile));
 return {pool,ranked:rows.length,picks:rows.slice(0,n).map(x=>({code:x.code,close:+x.close.toFixed(2),h5:+x.h5.toFixed(4)}))};}
export function evaluate(panel,arch){const {dates,di,series}=panel,D=dates.length,t=di.get(arch.formationDate);if(t===undefined)return {status:'formation date missing from data'};
 if(t+FWD.hold>=D)return {status:'pending',maturesAfterTradingDays:t+FWD.hold-(D-1)};
 const set=new Set(arch.picks.map(p=>p.code)),top=[],rest=[];let excluded=0,delist=0;
 for(const c of arch.pool){const fw=forward(series.get(c),t,FWD.hold,D);if(!fw)continue;if(fw.excluded){excluded++;continue;}if(set.has(c)){top.push(fw.r);if(fw.delistExit)delist++;}else rest.push(fw.r);}
 const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null,b=series.get(FWD.benchmark),bf=b?forward(b,t,FWD.hold,D):null;
 const pct=x=>x===null||x===undefined?null:+(x*100).toFixed(3);
 return {status:'matured',exitDate:dates[t+FWD.hold],picksCounted:top.length,restCounted:rest.length,excludedUnknown:excluded,delistExits:delist,
  picksPct:pct(mean(top)),restPct:pct(mean(rest)),excessPct:top.length&&rest.length?pct(mean(top)-mean(rest)):null,benchmark0050Pct:bf&&!bf.excluded?pct(bf.r):null,
  note:'含息、未扣成本；來回成本約 '+SPEC.costPct+'%'};}
export function step(root,{now=Date.now(),progress,to='9999',dir=path.join(root,'research','forward'),startMonth=FWD.startMonth}={}){const panel=loadPanel(root,{to}),{dates}=panel,D=dates.length,last=dates[D-1],out={sealed:null,missed:null};
 fs.mkdirSync(dir,{recursive:true});
 const first=new Map();dates.forEach((d,t)=>{if(!first.has(d.slice(0,7)))first.set(d.slice(0,7),t);});
 const lastMonth=last.slice(0,7),ft=first.get(lastMonth),file=path.join(dir,'h5-'+lastMonth+'.json');
 const bothOk=!progress||(String(progress.markets?.twse?.[last]).startsWith('ok')&&String(progress.markets?.tpex?.[last]).startsWith('ok'));
 if(lastMonth>=startMonth&&ft===D-1&&!fs.existsSync(file)&&bothOk){
  if(now<sealDeadline(last)){const p=pick(panel,D-1);fs.writeFileSync(file,JSON.stringify({version:FWD.version,basedOn:FWD.basedOn,formationDate:last,sealedAt:new Date(now).toISOString(),sealDeadline:new Date(sealDeadline(last)).toISOString(),entry:'下一交易日開盤',hold:FWD.hold,universe:p.pool.length,ranked:p.ranked,pool:p.pool,picks:p.picks},null,1)+'\n');out.sealed=lastMonth;}
  else out.missed=lastMonth;}
 // a month whose first trading day passed without a sealed list is recorded as missed, never filled in afterwards
 const log=path.join(dir,'missed.json'),missed=fs.existsSync(log)?JSON.parse(fs.readFileSync(log,'utf8')):[];
 for(const [m,t] of first)if(m>=startMonth&&t<D-1&&!fs.existsSync(path.join(dir,'h5-'+m+'.json'))&&!missed.includes(m))missed.push(m);
 if(out.missed&&!missed.includes(out.missed))missed.push(out.missed);fs.writeFileSync(log,JSON.stringify(missed.sort(),null,1)+'\n');
 const evals={};for(const f of fs.readdirSync(dir).filter(f=>/^h5-\d{4}-\d{2}\.json$/.test(f)).sort()){const a=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));evals[a.formationDate]={picks:a.picks.length,sealedAt:a.sealedAt,...evaluate(panel,a)};}
 fs.writeFileSync(path.join(dir,'h5-evaluation.json'),JSON.stringify({version:FWD.version,updatedThrough:last,missedMonths:missed,months:evals},null,1)+'\n');
 return {...out,last,months:Object.keys(evals).length,missed};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),i=process.argv.indexOf('--now'),now=i>0?Date.parse(process.argv[i+1]):Date.now();
 const progress=JSON.parse(fs.readFileSync(path.join(root,'data','progress.json'),'utf8'));console.log(JSON.stringify(step(root,{now,progress})));}
