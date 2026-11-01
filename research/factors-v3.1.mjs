// Errata v3.1 of SPEC-v3 (Issue #20): the monthly-revenue deadline is not always the 10th (Lunar New Year / COVID extensions to
// Feb 14-15 in 2019, 2020, 2022; holiday roll-forward; from 2026 insurers and financial holding companies file by the 15th).
// Only change: the decision date is the first trading day ON/AFTER THE 16TH of the month (later than every known deadline).
// B data other than revenue (foreign holdings, margin, P/E) is the same month's sample from the first trading day on/after the
// 11th, which is earlier than the decision date (no look-ahead). Conditions, costs, periods, bootstrap and verdict: unchanged.
// node research/factors-v3.1.mjs [out.json]
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadPanel,isCommon} from './lib/data.mjs';import {forward} from './factors-v1.mjs';import {prepare} from './factors-v2.mjs';
import {SPEC3,judge,loadB,groupsAt} from './factors-v3.mjs';import {formationDates} from '../scripts/fetch-b.mjs';
export const ERRATA31=Object.freeze({version:'factors-v3.1',basedOn:SPEC3.version,issue:20,decisionDay:16});
export function decisionDates(dates,fds,day=ERRATA31.decisionDay){const out=new Map();for(const {month} of fds){const d=dates.find(x=>x.slice(0,7)===month&&+x.slice(8)>=day);if(d)out.set(month,d);}return out;}
export function run(panel,B,fds){prepare(panel);const {dates,di,series}=panel,D=dates.length,codes=[...series.keys()].filter(isCommon).sort(),dd=decisionDates(dates,fds),out={},stats={};
 const tests=['B1','B2','B3','B4','B5','B6','B7','B8','B9','B10','B11'];for(const k of tests){out[k]=[];stats[k]={excluded:0,noNextOpen:0,dropped:0,skippedNoData:0};}
 const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
 for(let i=0;i<fds.length;i++){const dec=dd.get(fds[i].month);if(!dec)continue;const t=di.get(dec);if(t===undefined||t<SPEC3.warmup||t+SPEC3.hold>=D)continue;
  const G=groupsAt(panel,B,fds,i,codes,dec);if(!G||!G.defs)continue;
  for(const k of tests){const d=G.defs[k]();if(!d||d.p.length<50||!d.g.size){stats[k].skippedNoData++;continue;}
   const a=[],b=[];for(const c of d.p){const fw=forward(series.get(c),t,SPEC3.hold,D),g=d.g.has(c);if(!fw){stats[k].noNextOpen++;if(g)stats[k].dropped++;continue;}if(fw.excluded){stats[k].excluded++;if(g)stats[k].dropped++;continue;}(g?a:b).push(fw.r);}
   if(!a.length||!b.length)continue;out[k].push({date:dec,excess:mean(a)-mean(b),n:a.length,selected:d.g.size,universe:d.p.length});}}
 return {series:out,stats};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),t0=Date.now(),panel=loadPanel(root),fds=formationDates(JSON.parse(fs.readFileSync(path.join(root,'data','progress.json'),'utf8'))),{series,stats}=run(panel,loadB(root),fds);
 const names={B1:'營收年增最高',B2:'營收創12個月新高',B3:'累計營收年增最高',B4:'外資加碼',B5:'融資退場',B6:'低本益比',B7:'高殖利率',B8:'低股價淨值比',B9:'小市值',B10:'營收成長＋便宜',B11:'強勢產業'};
 const result={spec:ERRATA31.version,basedOn:SPEC3.version,decisionDay:ERRATA31.decisionDay,alpha:SPEC3.alpha,dataRange:[panel.dates[0],panel.dates.at(-1)],results:Object.fromEntries(Object.keys(series).map(k=>[k,{name:names[k],...judge(series[k],k),stats:stats[k]}])),seconds:Math.round((Date.now()-t0)/1000)};
 const text=JSON.stringify(result,null,1);if(process.argv[2])fs.writeFileSync(process.argv[2],text+'\n');console.log(text);}
