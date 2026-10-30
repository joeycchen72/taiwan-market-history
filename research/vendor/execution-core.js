"use strict";
const ExecutionCore=(()=>{
 const version='next-open-confirm-v1',positive=n=>Number.isFinite(n)&&n>0;
 const rule='僅下一交易日開盤：確認價≤開盤價≤上限；開低或開高即跳過，盤中不重新追入。';
 function nextDate(date,calendar){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!calendar)return null;for(let i=1;i<=20;i++){const d=new Date(Date.parse(date+'T00:00:00Z')+i*86400000),s=d.toISOString().slice(0,10);const cal=d.getUTCFullYear()===calendar.year?calendar:calendar.years?.[d.getUTCFullYear()];if(!cal)return null;if(!(cal.closed||[]).includes(s)&&(d.getUTCDay()>=1&&d.getUTCDay()<=5||(cal.opened||[]).includes(s)))return s;}return null;}
 function freeze(plan,date,validForDate=null){return {...plan,basisDate:date,validForDate,executionModel:version,openingOnly:true,expiry:'下一交易日開盤檢查後失效',executionRule:rule};}
 function opening(p,bar){if(p?.executionModel!==version)return {code:'legacy',eligible:false,label:'舊計畫未保存一致進場規則，只作觸價觀察'};
  if(!p.validForDate)return {code:'unknown',eligible:false,label:'下一交易日未核對，暫緩模擬'};
  if(!bar?.date||!positive(bar.open))return {code:'unknown',eligible:false,label:'缺有效開盤日期或開盤價'};
  if(bar.date!==p.validForDate)return {code:'expired',eligible:false,label:'不是計畫指定交易日，不補做交易'};
  if(![p.entry,p.maxEntry,p.stop,p.target,bar.open].every(positive)||p.stop>=p.entry||p.maxEntry<p.entry||p.target<=p.entry)return {code:'unknown',eligible:false,label:'價格計畫或開盤資料無效'};
  if(bar.open<=p.stop)return {code:'invalid',eligible:false,label:'開盤低於風險線，計畫失效'};
  if(bar.open>p.maxEntry)return {code:'gap',eligible:false,label:'開盤超過上限，當日跳過'};
  if(bar.open<p.entry)return {code:'below',eligible:false,label:'開盤未達確認價，當日跳過'};
  return {code:'eligible',eligible:true,price:bar.open,label:'符合開盤條件；僅可作假設成交'};
 }
 function exit(p,bar,heldDays=1){if(!positive(bar?.open)||!positive(bar?.high)||!positive(bar?.low)||!positive(bar?.close))return null;
  if(positive(p.stop)&&bar.open<=p.stop)return {price:bar.open,reason:'跳空風險線',collision:false};
  if(positive(p.target)&&bar.open>=p.target)return {price:bar.open,reason:'跳空獲利參考',collision:false};
  if(positive(p.stop)&&bar.low<=p.stop)return {price:p.stop,reason:'風險線',collision:positive(p.target)&&bar.high>=p.target};
  if(positive(p.target)&&bar.high>=p.target)return {price:p.target,reason:'獲利參考',collision:false};
  if(heldDays>=20)return {price:bar.close,reason:'20交易日到期',collision:false};return null;
 }
 return {version,rule,nextDate,freeze,opening,exit};
})();
if(typeof module!=='undefined')module.exports=ExecutionCore;
