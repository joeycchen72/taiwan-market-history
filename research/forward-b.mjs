// Forward (out-of-sample) observation of B2 "revenue at a 12-month high" and B4 "foreign buying" (SPEC-v3 / RESULTS-v3).
// Seals each month's lists on the formation date (first trading day on/after the 11th), after that day's daily and B data are
// downloaded and BEFORE the next session opens; evaluates matured lists after 21 trading days. Never fills a list in afterwards.
// node research/forward-b.mjs [--now ISO]
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadPanel,isCommon} from './lib/data.mjs';
import {prepare} from './factors-v2.mjs';
import {loadB,groupsAt} from './factors-v3.mjs';
import {formationDates} from '../scripts/fetch-b.mjs';
import {sealDeadline,evaluate} from './forward-h5.mjs';
export const FWDB=Object.freeze({version:'forward-b-v1',basedOn:'factors-v3',tests:['B2','B4'],startMonth:'2026-11',hold:21});
const monthAdd=(m,d)=>{const [y,mo]=m.split('-').map(Number);return new Date(Date.UTC(y,mo-1+d,1)).toISOString().slice(0,7);};
export function step(root,{now=Date.now(),to='9999',dir=path.join(root,'research','forward'),startMonth=FWDB.startMonth}={}){
 fs.mkdirSync(dir,{recursive:true});const daily=JSON.parse(fs.readFileSync(path.join(root,'data','progress.json'),'utf8')),bprog=JSON.parse(fs.readFileSync(path.join(root,'data','b','progress.json'),'utf8'));
 const panel=prepare(loadPanel(root,{to})),{dates}=panel,D=dates.length,last=dates[D-1],codes=[...panel.series.keys()].filter(isCommon).sort();
 const fds=formationDates(daily).filter(x=>x.date<=last),B=loadB(root),out={sealed:[],missed:[]};
 const ok=k=>String(bprog.done?.[k]||'').startsWith('ok'),i=fds.findIndex(x=>x.date===last);
 if(i>=0&&fds[i].month>=startMonth){const {month,date}=fds[i],rm=monthAdd(month,-1);
  const ready=String(daily.markets.twse[date]).startsWith('ok')&&String(daily.markets.tpex[date]).startsWith('ok')&&ok('qfii-twse|'+date)&&ok('qfii-tpex|'+date)&&ok('revenue-sii|'+rm)&&ok('revenue-otc|'+rm);
  if(ready){const G=groupsAt(panel,B,fds,i,codes);
   for(const k of FWDB.tests){const file=path.join(dir,k.toLowerCase()+'-'+month+'.json');if(fs.existsSync(file))continue;
    if(now>=sealDeadline(date)){out.missed.push(k+' '+month);continue;}
    const d=G?.defs?.[k]?.();if(!d){out.missed.push(k+' '+month+' (no data)');continue;}
    fs.writeFileSync(file,JSON.stringify({version:FWDB.version,basedOn:FWDB.basedOn+' '+k,formationDate:date,revenueMonth:rm,sealedAt:new Date(now).toISOString(),sealDeadline:new Date(sealDeadline(date)).toISOString(),entry:'下一交易日開盤',hold:FWDB.hold,universe:d.p.length,pool:d.p,picks:[...d.g].sort().map(code=>({code,close:+panel.series.get(code).c[D-1].toFixed(2)}))},null,1)+'\n');out.sealed.push(k+' '+month);}}}
 // months whose formation date already passed without a sealed list are recorded as missed, never filled in
 const log=path.join(dir,'missed-b.json'),missed=fs.existsSync(log)?JSON.parse(fs.readFileSync(log,'utf8')):[];
 for(const {month,date} of fds)if(month>=startMonth&&date<last)for(const k of FWDB.tests){const key=k+' '+month;if(!fs.existsSync(path.join(dir,k.toLowerCase()+'-'+month+'.json'))&&!missed.includes(key))missed.push(key);}
 for(const m of out.missed)if(!missed.includes(m))missed.push(m);fs.writeFileSync(log,JSON.stringify(missed.sort(),null,1)+'\n');
 const evals={};for(const k of FWDB.tests){evals[k]={};for(const f of fs.readdirSync(dir).filter(f=>new RegExp('^'+k.toLowerCase()+'-\\d{4}-\\d{2}\\.json$').test(f)).sort()){const a=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));evals[k][a.formationDate]={picks:a.picks.length,sealedAt:a.sealedAt,...evaluate(panel,a)};}}
 fs.writeFileSync(path.join(dir,'b-evaluation.json'),JSON.stringify({version:FWDB.version,updatedThrough:last,missed,months:evals},null,1)+'\n');
 return {...out,last};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),i=process.argv.indexOf('--now');console.log(JSON.stringify(step(root,{now:i>0?Date.parse(process.argv[i+1]):Date.now()})));}
