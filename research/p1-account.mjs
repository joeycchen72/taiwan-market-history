// Experimental P1 paper account (SPEC-v6 P1 FAILED the ten-year test; watched forward only, never a recommendation).
// Uses only lists sealed before the next open (research/forward/p1-YYYY-MM.json) and official daily prices:
// buy each list equally at the next trading day's official open, hold 21 trading days, sell at that day's close.
// Costs follow SPEC-v6 (0.785% round trip): buy 0.1425% fee + 0.1% slippage; sell 0.1425% fee + 0.3% tax + 0.1% slippage.
// Prices are total-return adjusted (dividends kept in the position). Odd lots allowed. No intraday fill is assumed.
// node research/p1-account.mjs
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadPanel} from './lib/data.mjs';import {prepare} from './factors-v2.mjs';
export const P1A=Object.freeze({version:'p1-account-v1',capital:100000,hold:21,buyCost:0.002425,sellCost:0.005425,label:'未通過十年驗證，觀察中'});
export function build(panel,lists){const {dates,di,series}=panel,D=dates.length,last=dates[D-1],etf=series.get('0050');
 const adj=(s,t)=>s&&s.c[t]>0&&s.tri[t]>0?s.tri[t]:NaN,openAdj=(s,t)=>s&&s.o[t]>0&&s.c[t]>0?s.o[t]*s.tri[t]/s.c[t]:NaN;
 const out={version:P1A.version,label:P1A.label,validated:false,rule:'每月營收名單（B2）中，收盤最接近 52 週高點的 6 檔；隔日開盤等額買進，持有 21 個交易日後收盤賣出',capital:P1A.capital,costs:{buyPct:P1A.buyCost*100,sellPct:P1A.sellCost*100},updatedThrough:last,start:null,nav:null,bench:null,periods:[],marks:[]};
 let cash=P1A.capital,free=0,held=null,bench=null;const marks=new Map();
 const value=(pos,t)=>pos.reduce((v,p)=>{const a=adj(series.get(p.code),t);if(a>0)p.lastAdj=a;return v+p.units*p.lastAdj;},0);
 const queue=[...lists].sort((a,b)=>a.formationDate.localeCompare(b.formationDate));
 for(const L of queue){const tf=di.get(L.formationDate);if(tf===undefined){out.periods.push({month:L.formationDate.slice(0,7),status:'formation date missing from data'});continue;}
  let te=Math.max(tf+1,free);const per={month:L.formationDate.slice(0,7),formationDate:L.formationDate,delayed:te>tf+1,picks:[]};out.periods.push(per);
  if(te>=D){per.status='waiting for entry';continue;}
  const ok=L.picks.map(p=>p.code).filter(c=>openAdj(series.get(c),te)>0);if(!ok.length){per.status='no tradable open';continue;}
  per.entryDate=dates[te];const each=cash/ok.length;let spent=0;
  held=ok.map(code=>{const s=series.get(code),px=openAdj(s,te),units=each/(px*(1+P1A.buyCost));spent+=units*px*(1+P1A.buyCost);return {code,units,entryAdj:px,entryPrice:+s.o[te].toFixed(2),lastAdj:px};});
  per.missing=L.picks.map(p=>p.code).filter(c=>!ok.includes(c));cash-=spent;
  if(!bench&&etf){const px=openAdj(etf,te);if(px>0){bench={units:P1A.capital/(px*(1+P1A.buyCost)),last:px};out.start=dates[te];}}
  const tx=te+P1A.hold-1,end=Math.min(tx,D-1);
  for(let t=te;t<=end;t++)marks.set(t,cash+value(held,t));
  per.picks=held.map(p=>({code:p.code,entryPrice:p.entryPrice,returnPct:+((p.lastAdj/p.entryAdj-1)*100).toFixed(2)}));
  if(tx<=D-1){const gross=value(held,tx);cash+=gross*(1-P1A.sellCost);per.exitDate=dates[tx];per.status='closed';marks.set(tx,cash);held=null;free=tx+1;}
  else{per.status='holding';per.exitDue=null;per.tradingDaysLeft=tx-(D-1);free=D;}
  per.navAfter=+(marks.get(end)).toFixed(0);}
 if(bench){const t0=di.get(out.start);for(let t=t0;t<D;t++){const a=adj(etf,t);if(a>0)bench.last=a;let nav=marks.get(t);if(nav===undefined){nav=[...marks.keys()].filter(k=>k<t).length?marks.get(Math.max(...[...marks.keys()].filter(k=>k<t))):P1A.capital;marks.set(t,nav);}
   out.marks.push({date:dates[t],nav:Math.round(nav),bench:Math.round(bench.units*bench.last)});}
  const m=out.marks.at(-1);out.nav=m.nav;out.bench=m.bench;out.note='持有中的期別以最新收盤估值，尚未扣賣出成本；0050 同日開盤買進持有、未扣賣出成本';}
 return out;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=path.join(root,'research','forward');
 const lists=fs.readdirSync(dir).filter(f=>/^p1-\d{4}-\d{2}\.json$/.test(f)).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')));
 if(!lists.length){console.log(JSON.stringify({p1:'no sealed list yet'}));process.exit(0);}
 const from=lists.map(l=>l.formationDate).sort()[0].slice(0,7)+'-01',panel=prepare(loadPanel(root,{from:new Date(Date.parse(from)-40*86400000).toISOString().slice(0,10)}));
 const a=build(panel,lists);fs.writeFileSync(path.join(dir,'p1-account.json'),JSON.stringify(a,null,1)+'\n');console.log(JSON.stringify({p1:a.periods.length,nav:a.nav,bench:a.bench,through:a.updatedThrough}));}
