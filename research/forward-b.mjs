// Forward (out-of-sample) observation of B2 "revenue at a 12-month high" and B4 "foreign buying" (SPEC-v3 / RESULTS-v3).
// Seals each month's lists on the formation date (first trading day on/after the 11th), after that day's daily and B data are
// downloaded and BEFORE the next session opens; evaluates matured lists after 21 trading days. Never fills a list in afterwards.
// node research/forward-b.mjs [--now ISO]
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadPanel,isCommon} from './lib/data.mjs';
import {prepare} from './factors-v2.mjs';
import {loadB,groupsAt} from './factors-v3.mjs';
import {formationDates,decisionDate} from '../scripts/fetch-b.mjs';
import {sealDeadline,evaluate} from './forward-h5.mjs';
import {SPEC6,keys,pick} from './factors-v6.mjs';
export const FWDB=Object.freeze({version:'forward-b-v1.1',basedOn:'factors-v3 (B4) / factors-v3.1 (B2)',tests:['B2','B4'],startMonth:'2026-11',hold:21});
// B4 is decided on the sample date (first trading day on/after the 11th, as v3); B2 on the v3.1 decision date (on/after the 16th),
// after last month's revenue has been re-fetched that day (revenue16 jobs).
const monthAdd=(m,d)=>{const [y,mo]=m.split('-').map(Number);return new Date(Date.UTC(y,mo-1+d,1)).toISOString().slice(0,7);};
export function step(root,{now=Date.now(),to='9999',dir=path.join(root,'research','forward'),startMonth=FWDB.startMonth,requireRefetch=true}={}){
 fs.mkdirSync(dir,{recursive:true});const daily=JSON.parse(fs.readFileSync(path.join(root,'data','progress.json'),'utf8')),bprog=JSON.parse(fs.readFileSync(path.join(root,'data','b','progress.json'),'utf8'));
 const panel=prepare(loadPanel(root,{to})),{dates}=panel,D=dates.length,last=dates[D-1],codes=[...panel.series.keys()].filter(isCommon).sort();
 const fds=formationDates(daily).filter(x=>x.date<=last),B=loadB(root),out={sealed:[],missed:[]};
 const ok=k=>String(bprog.done?.[k]||'').startsWith('ok'),dayOk=d=>String(daily.markets.twse[d]).startsWith('ok')&&String(daily.markets.tpex[d]).startsWith('ok');
 const seal=(k,i,date,dec)=>{const {month}=fds[i],rm=monthAdd(month,-1),file=path.join(dir,k.toLowerCase()+'-'+month+'.json');if(fs.existsSync(file))return;
  if(now>=sealDeadline(dec)){out.missed.push(k+' '+month);return;}
  const G=groupsAt(panel,B,fds,i,codes,dec===date?null:dec),d=G?.defs?.[k]?.();if(!d){out.missed.push(k+' '+month+' (no data)');return;}
  fs.writeFileSync(file,JSON.stringify({version:FWDB.version,basedOn:(k==='B2'?'factors-v3.1 ':'factors-v3 ')+k,formationDate:dec,dataSampleDate:date,revenueMonth:rm,sealedAt:new Date(now).toISOString(),sealDeadline:new Date(sealDeadline(dec)).toISOString(),entry:'下一交易日開盤',hold:FWDB.hold,universe:d.p.length,pool:d.p,picks:[...d.g].sort().map(code=>({code,close:+panel.series.get(code).c[D-1].toFixed(2)}))},null,1)+'\n');out.sealed.push(k+' '+month);
  // Experimental P1 (SPEC-v6): the 6 B2 names closest to their 252-day high. It FAILED the ten-year test and is sealed only to be
  // watched forward; it is never a recommendation and never counted as a validated result.
  if(k==='B2'){const pf=path.join(dir,'p1-'+month+'.json');if(!fs.existsSync(pf)){const t=D-1,list=[...d.g].map(c=>({c,...keys(panel.series.get(c),t)})),cs=pick(list,'P1');
   fs.writeFileSync(pf,JSON.stringify({version:'p1-experiment-v1',basedOn:'SPEC-v6 P1 (failed the ten-year test; experimental only)',validated:false,label:'未通過十年驗證，觀察中',formationDate:dec,revenueMonth:rm,sealedAt:new Date(now).toISOString(),sealDeadline:new Date(sealDeadline(dec)).toISOString(),entry:'下一交易日開盤',hold:SPEC6.hold,costPct:SPEC6.costPct,b2Size:d.g.size,pool:[...d.g].sort(),picks:cs.map(code=>({code,close:+panel.series.get(code).c[t].toFixed(2),nearHigh:+list.find(x=>x.c===code).P1.toFixed(4)}))},null,1)+'\n');out.sealed.push('P1 '+month);}}};
 for(let i=0;i<fds.length;i++){const {month,date}=fds[i];if(month<startMonth)continue;const rm=monthAdd(month,-1);
  // B4 on the sample date
  if(date===last&&dayOk(date)&&ok('qfii-twse|'+date)&&ok('qfii-tpex|'+date))seal('B4',i,date,date);
  // B2 on the decision date (>= 16th), after revenue was re-fetched that day
  const dec=decisionDate(daily,month);if(dec&&dec===last&&dayOk(dec)&&(requireRefetch?ok('revenue16-sii|'+rm)&&ok('revenue16-otc|'+rm):ok('revenue-sii|'+rm)&&ok('revenue-otc|'+rm)))seal('B2',i,date,dec);}
 // months whose formation date already passed without a sealed list are recorded as missed, never filled in
 const log=path.join(dir,'missed-b.json'),missed=fs.existsSync(log)?JSON.parse(fs.readFileSync(log,'utf8')):[];
 for(const {month,date} of fds){if(month<startMonth)continue;const due={B4:date,B2:decisionDate(daily,month)};for(const k of FWDB.tests){const key=k+' '+month;if(due[k]&&due[k]<last&&!fs.existsSync(path.join(dir,k.toLowerCase()+'-'+month+'.json'))&&!missed.includes(key))missed.push(key);}}
 for(const m of out.missed)if(!missed.includes(m))missed.push(m);fs.writeFileSync(log,JSON.stringify(missed.sort(),null,1)+'\n');
 const evals={};for(const k of [...FWDB.tests,'P1']){evals[k]={};for(const f of fs.readdirSync(dir).filter(f=>new RegExp('^'+k.toLowerCase()+'-\\d{4}-\\d{2}\\.json$').test(f)).sort()){const a=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));evals[k][a.formationDate]={picks:a.picks.length,sealedAt:a.sealedAt,...evaluate(panel,a)};}}
 fs.writeFileSync(path.join(dir,'b-evaluation.json'),JSON.stringify({version:FWDB.version,updatedThrough:last,missed,months:evals},null,1)+'\n');
 return {...out,last};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),i=process.argv.indexOf('--now');console.log(JSON.stringify(step(root,{now:i>0?Date.parse(process.argv[i+1]):Date.now()})));}
