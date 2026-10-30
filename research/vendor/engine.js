"use strict";
const LabEngine=(()=>{
 const X=typeof ExecutionCore!=='undefined'?ExecutionCore:require('./execution-core.js');
 const DEFAULTS={capital:100000,monthRisk:10000,monthLoss:0,risk:1000,allocation:50,fee:.1425,minFee:20,slip:.1,tax:.3};
 const mean=a=>a.length?a.reduce((v,x)=>v+x,0)/a.length:NaN;
 const ma=(rs,n,i=rs.length-1)=>i+1<n?NaN:mean(rs.slice(i-n+1,i+1).map(r=>r.close));
 const tick=(p,kind="股票")=>kind==="ETF"?(p<50?.01:.05):p<10?.01:p<50?.05:p<100?.1:p<500?.5:p<1000?1:5;
 const round=(p,up=true,kind="股票")=>+(Math[up?"ceil":"floor"]((p+(up?-1:1)*1e-8)/tick(p,kind))*tick(p,kind)).toFixed(2);
 const atrCache=new WeakMap();
 function atrs(rs,n=14){let cached=atrCache.get(rs);if(cached&&cached.n===n&&cached.inputs.length===rs.length&&rs.every((r,i)=>r.high===cached.inputs[i][0]&&r.low===cached.inputs[i][1]&&r.close===cached.inputs[i][2]))return cached.out;const out=new Array(rs.length).fill(NaN),tr=rs.map((r,i)=>i?Math.max(r.high-r.low,Math.abs(r.high-rs[i-1].close),Math.abs(r.low-rs[i-1].close)):r.high-r.low);if(rs.length>=n){out[n-1]=mean(tr.slice(0,n));for(let i=n;i<rs.length;i++)out[i]=(out[i-1]*(n-1)+tr[i])/n;}atrCache.set(rs,{n,inputs:rs.map(r=>[r.high,r.low,r.close]),out});return out;}
 function indicators(rs,i=rs.length-1,version="v2"){
  const last=rs[i],prev=rs[i-1],base={last,change:prev?(last.close/prev.close-1)*100:NaN,ready:false,pass:false,flags:[],m20:ma(rs,20,i),m60:ma(rs,60,i),atr:atrs(rs)[i],ret20:i>=20?(last.close/rs[i-20].close-1)*100:NaN};
  if(version==="v1"){if(i<10)return base;const prior=rs.slice(i-5,i),m5=ma(rs,5,i),m10=ma(rs,10,i),vol=mean(prior.map(r=>r.volume)),ratio=vol?last.volume/vol:NaN,breakout=Math.max(...prior.map(r=>r.high)),ret5=(last.close/rs[i-5].close-1)*100,flags=[last.close>m10,m5>m10,ret5>0,ratio>=1.2,last.close>breakout];return {...base,ready:true,pass:flags.every(Boolean),flags,m5,m10,ratio,breakout,ret5};}
  if(i<64)return base;
  const prior=rs.slice(i-20,i),vol=mean(prior.map(r=>r.volume)),ratio=vol?last.volume/vol:NaN,breakout=Math.max(...prior.map(r=>r.high)),distance=(last.close-base.m20)/base.atr;
  const flags=[last.close>base.m20&&base.m20>base.m60&&base.m20>ma(rs,20,i-5),ratio>=1.3,last.close>breakout,distance>=0&&distance<=3];
  return {...base,ready:true,flags,pass:flags.every(Boolean),ratio,breakout,distance};
 }
 function costs(q,entry,exit,p=DEFAULTS){
  const fee=p.fee/100,slip=p.slip/100,buy=q*entry*(1+slip),sell=q*exit*(1-slip),buyFee=Math.max(p.minFee,buy*fee),sellFee=Math.max(p.minFee,sell*fee);
  return {cost:buy+buyFee,proceeds:sell-sellFee-sell*((p.tax??.3)/100),pnl:sell-sellFee-sell*((p.tax??.3)/100)-buy-buyFee};
 }
 function validate(p){return ["capital","monthRisk","monthLoss","risk","allocation","fee","minFee","slip"].every(k=>Number.isFinite(p[k]))&&p.capital>0&&p.capital<=1e8&&p.monthRisk>0&&p.monthRisk<=p.capital&&p.monthLoss>=0&&p.risk>0&&p.risk<=p.monthRisk&&p.allocation>0&&p.allocation<=100&&p.fee>=0&&p.fee<=5&&p.minFee>=0&&p.slip>=0&&p.slip<=5&&Number.isFinite(p.tax??.3)&&(p.tax??.3)>=0&&(p.tax??.3)<=1;}
 function position(input){const p={...DEFAULTS,...input};if(!validate(p)||![p.entry,p.stop,p.target].every(Number.isFinite)||p.stop<=0||p.entry<=p.stop||p.target<=p.entry)return {error:"請確認輸入：停損價 < 買價 < 目標價；單筆風險不得超過月度警戒。"};
  const monthlyRemaining=Math.max(0,p.monthRisk-p.monthLoss),allowedRisk=Math.min(p.risk,monthlyRemaining);if(!allowedRisk)return {error:"本月風險額度已用完，暫停新增部位。"};
  const cashCap=p.capital*p.allocation/100;let lo=0,hi=Math.floor(cashCap/p.entry);
  while(lo<hi){const mid=Math.ceil((lo+hi)/2),c=costs(mid,p.entry,p.stop,p);if(c.cost<=cashCap&&-c.pnl<=allowedRisk)lo=mid;else hi=mid-1;}
  if(!lo)return {error:"資金或風險預算不足以買進 1 股。"};
  const win=costs(lo,p.entry,p.target,p),loss=costs(lo,p.entry,p.stop,p);
  return {q:lo,cost:win.cost,profit:win.pnl,loss:-loss.pnl,rr:win.pnl/-loss.pnl,capitalReturn:win.pnl/p.capital*100,allowedRisk,monthlyRemaining};
 }
 function plan(rs,i=rs.length-1,version="v2",actualEntry=null,kind="股票"){
  const a=indicators(rs,i,version);if(!a.ready)return {error:"至少需要 "+(version==="v2"?65:11)+" 筆有效日線。",a};
  const entry=actualEntry??a.last.close;
  const stop=version==="v2"?round(a.last.close-2*a.atr,false,kind):round(a.last.low-tick(a.last.low,kind),false,kind);
  if(stop<=0||entry<=stop)return {error:"停損位置不適用，跳過。",a};
  const risk=entry-stop;return {a,entry,stop,risk,riskPct:risk/entry*100,target:round(entry+2*risk,true,kind),extended:round(entry+3*risk,true,kind),maxEntry:round(a.last.close*1.01,false,kind),trigger:round(a.breakout+tick(a.breakout,kind),true,kind),eligible:risk/entry<=.08};
 }
 function evaluate(rs,settings=DEFAULTS,version="v2"){const p=plan(rs,rs.length-1,version,null,settings.kind);if(p.error)return {...p,eligible:false,reason:p.error};const size=position({...settings,entry:p.entry,stop:p.stop,target:p.target});const gate=p.eligible&&!size.error&&(version==="v1"||size.rr>=1.5);const reason=!p.a.pass?"量價條件尚未全部成立":!p.eligible?"停損距離超過 8%":size.error?size.error:!gate?"扣成本後報酬／風險低於 1.5":"條件成立，下一交易日仍須確認開盤與成交價";
 return {...p,size,eligible:!!(p.a.pass&&gate),reason};}
 function summarize(ts){const wins=ts.filter(t=>t.pnl>0),loss=ts.filter(t=>t.pnl<=0),profit=wins.reduce((a,t)=>a+t.pnl,0),lossAmount=-loss.reduce((a,t)=>a+t.pnl,0);return {count:ts.length,winRate:ts.length?wins.length/ts.length*100:NaN,meanReturn:mean(ts.map(t=>t.ret)),profitFactor:lossAmount>0?profit/lossAmount:profit>0?Infinity:NaN,meanCapitalReturn:mean(ts.map(t=>t.capitalReturn))};}
 function simulate(rs,settings=DEFAULTS,version="v2"){
  const p={...DEFAULTS,...settings,monthLoss:0};if(!validate(p))return {error:"資金、風險或費用設定不合法。"};
  if(rs.length<100)return {error:"至少需要 100 筆有效日線，建議使用數年資料。"};
  const split=Math.floor(rs.length*.7),trades=[],equity=[],realizedByMonth={};let cash=p.capital,holding=null,pending=null,skipped=0,peak=p.capital,maxDD=0;
  for(let i=0;i<rs.length;i++){const bar=rs[i],month=bar.date.slice(0,7);let exitedToday=false;
   if(pending){const signal=pending;pending=null;const price=bar.open,x=plan(rs,signal.i,version,price,p.kind),monthLoss=Math.max(0,-(realizedByMonth[month]||0)),settingsAtEntry={...p,capital:cash,monthRisk:Math.min(p.monthRisk,cash),monthLoss};
    const confirmed=p.executionModel===X.version,signalPlan=plan(rs,signal.i,version,null,p.kind),frozen=X.freeze(signalPlan,rs[signal.i].date,X.nextDate(rs[signal.i].date,p.calendar)),opening=confirmed?X.opening(frozen,bar):null;
    if(confirmed&&(!opening.eligible||!signalPlan.a?.pass)||price>signal.close*1.01||x.error||!x.eligible){skipped++;}
    else if(confirmed){const sizing=position({...settingsAtEntry,entry:price,stop:frozen.stop,target:frozen.target});if(sizing.error||sizing.rr<1.5){skipped++;}else {const c=costs(sizing.q,price,frozen.target,p);cash-=c.cost;holding={entry:price,stop:frozen.stop,target:frozen.target,q:sizing.q,cost:c.cost,buyIndex:i,signalIndex:signal.i};}}
    else {const sizing=position({...settingsAtEntry,entry:price,stop:x.stop,target:x.target});if(sizing.error||(version==="v2"&&sizing.rr<1.5)){skipped++;}else {const c=costs(sizing.q,price,x.target,p);cash-=c.cost;holding={entry:price,stop:x.stop,target:x.target,q:sizing.q,cost:c.cost,buyIndex:i,signalIndex:signal.i};}}}
   if(holding){const h=holding;let exit=null,reason="";
    if(p.executionModel===X.version){const out=X.exit(h,bar,i-h.buyIndex+1);if(out){exit=out.price;reason=out.collision?'同日先停損（保守假設）':out.reason;}}
    else if(bar.open<=h.stop){exit=bar.open;reason="跳空停損";}
    else if(bar.low<=h.stop){exit=h.stop;reason=bar.high>=h.target?"同日先停損":"停損";}
    else if(bar.high>=h.target){exit=h.target;reason="2R 目標";}
    else if(i-h.buyIndex+1>=20){exit=bar.close;reason="20 日到期";}
    if(exit!==null){const c=costs(h.q,h.entry,exit,p);cash+=c.proceeds;const t={signal:rs[h.signalIndex].date,buy:rs[h.buyIndex].date,sell:bar.date,entry:h.entry,exit,stop:h.stop,target:h.target,q:h.q,pnl:c.pnl,ret:c.pnl/h.cost*100,capitalReturn:c.pnl/p.capital*100,reason,signalIndex:h.signalIndex,buyIndex:h.buyIndex,exitIndex:i};trades.push(t);realizedByMonth[month]=(realizedByMonth[month]||0)+c.pnl;holding=null;exitedToday=true;}}
   const nav=cash+(holding?costs(holding.q,holding.entry,bar.close,p).proceeds:0);equity.push({date:bar.date,value:nav});peak=Math.max(peak,nav);maxDD=Math.max(maxDD,(peak-nav)/peak*100);
   if(!holding&&!pending&&!exitedToday&&i<rs.length-1){const a=indicators(rs,i,version);if(a.pass){if((realizedByMonth[month]||0)<=-p.monthRisk){skipped++;}else pending={i,close:a.last.close};}}
  }
  const monthly=new Map();equity.forEach(e=>monthly.set(e.date.slice(0,7),e.value));let prev=p.capital;const monthReturns=[];for(const [month,nav]of monthly){monthReturns.push({month,pnl:nav-prev,returnPct:(nav/prev-1)*100});prev=nav;}
  // Boundary-crossing trades are excluded from both temporal segments.
  const early=trades.filter(t=>t.exitIndex<split),late=trades.filter(t=>t.buyIndex>=split);
  return {version,executionModel:p.executionModel===X.version?X.version:'legacy-next-open-v2',trades,summary:summarize(trades),early:summarize(early),late:summarize(late),splitDate:rs[split].date,crossing:trades.length-early.length-late.length,equity,totalReturn:(equity.at(-1).value/p.capital-1)*100,maxDD,monthReturns,open:holding?{...holding,mark:rs.at(-1).close}:null,skipped,endingEquity:equity.at(-1).value};
 }
 return {DEFAULTS,ma,atrs,tick,round,indicators,costs,position,plan,evaluate,summarize,simulate};
})();
if(typeof module!=="undefined")module.exports=LabEngine;
