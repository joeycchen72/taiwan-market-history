import assert from 'node:assert/strict';
import {parseTwse,parseTpex,parseTwt49u,toCsv,urls,keepEquity} from '../scripts/sources.mjs';
import {weekdays} from '../scripts/backfill.mjs';
const F=['證券代號','證券名稱','成交股數','成交筆數','成交金額','開盤價','最高價','最低價','收盤價','漲跌(+/-)','漲跌價差','最後揭示買價','最後揭示買量','最後揭示賣價','最後揭示賣量','本益比'];
const row=(c,sign,chg)=>[c,'名稱','1,000','10','100,000','10.00','10.50','9.90',c==='9999'?'--':'10.20',sign,chg,'','','','',''];
const many=n=>Array.from({length:n},(_,i)=>row(String(1100+i),'<p style= color:red>+</p>','0.20'));
// new-format tables, signs, ex-rights X, no-trade "--"
let r=parseTwse({stat:'OK',date:'20261029',tables:[{title:'index',fields:['指數','收盤指數'],data:[['x','1']]},{fields:F,data:[row('2330','<p style= color:green>-</p>','5.00'),row('0050','<p> </p>','0.00'),row('2412','<p>X</p>','0.00'),row('9999','','')]}]},'2026-10-29');
assert.equal(r.status,'ok');assert.deepEqual(r.rows[0].slice(0,6),['2330','名稱',10,10.5,9.9,10.2]);assert.equal(r.rows[0][6],1000);assert.equal(r.rows[0][9],-5);assert.equal(r.rows[1][9],0);assert.equal(r.rows[2][10],'X');assert.equal(r.rows[2][9],null);assert.equal(r.rows[3][5],null);
// old format fields9/data9
r=parseTwse({stat:'OK',date:'20150105',fields9:F,data9:many(3)},'2015-01-05');assert.equal(r.rows.length,3);assert.equal(r.rows[0][9],0.2);
// holiday / wrong date
assert.equal(parseTwse({stat:'很抱歉，沒有符合條件的資料!'},'2026-10-10').status,'closed');
assert.throws(()=>parseTwse({stat:'OK',date:'20261028',tables:[{fields:F,data:many(2)}]},'2026-10-29'));
// TPEx
const T=['代號','名稱','收盤','漲跌','開盤','最高','最低','均價','成交股數','成交金額(元)','成交筆數'];
r=parseTpex({stat:'ok',date:'20261029',tables:[{fields:T,data:[['6488','環球晶','400.00','-5.50','405.00','406.00','399.00','401','1,234,000','495,000,000','900'],['3105','穩懋','100.00','除息','101','102','99','100','10','1000','1']]}]},'2026-10-29');
assert.equal(r.rows[0][9],-5.5);assert.equal(r.rows[0][5],400);assert.equal(r.rows[0][6],1234000);assert.equal(r.rows[1][10],'X');assert.equal(r.rows[1][9],null);
assert.equal(parseTpex({stat:'ok',date:'20261010',tables:[{fields:T,data:[]}]},'2026-10-10').status,'closed');
assert.ok(toCsv([['2330','n',1,2,0.5,1.5,10,15,1,0.1,'']]).startsWith('code,name,open'));
assert.ok(urls.twse('2026-10-29').includes('date=20261029'));assert.ok(urls.tpex('2026-10-29').includes('date=2026/10/29'));
const w=weekdays('2026-10-24','2026-10-30');assert.deepEqual(w,['2026-10-30','2026-10-29','2026-10-28','2026-10-27','2026-10-26']);
assert.deepEqual(keepEquity([['2330'],['00400A'],['006201'],['00679B'],['020001'],['700123'],['2881A'],['12345']]).map(r=>r[0]),['2330','00400A','006201','00679B']);
// TWT49U ex-rights results (ROC dates) and TPEx next-day reference price
const W=['資料日期','股票代號','股票名稱','除權息前收盤價','除權息參考價','權值+息值','權/息','漲停價格','跌停價格'];
let ex=parseTwt49u({stat:'OK',fields:W,data:[['115年09月16日','2330','台積電','2385.00','2378.00','7.00','息','2615','2141']]});assert.deepEqual(ex.rows[0],['2026-09-16','2330',2385,2378,7,'息']);
ex=parseTwt49u({stat:'OK',tables:[{fields:W,data:[['104年07月20日','0050','台灣50','70.10','69.60','0.50','息','','']]}]});assert.equal(ex.rows[0][0],'2015-07-20');
assert.equal(parseTwt49u({stat:'很抱歉，沒有符合條件的資料!'}).status,'empty');
assert.ok(urls.twseExright('2026-02').includes('startDate=20260201&endDate=20260228'));
const T2=['代號','名稱','收盤','漲跌','開盤','最高','最低','均價','成交股數','成交金額(元)','成交筆數','最後買價','最後買量(張數)','最後賣價','最後賣量(張數)','發行股數','次日參考價','次日漲停價','次日跌停價'];
const tp=parseTpex({stat:'ok',date:'20261029',tables:[{fields:T2,data:[['6488','環球晶','400.00','-5.50','405','406','399','401','1,000','400,000','9','','','','','1','398.20','438','358.4']]}]},'2026-10-29');assert.equal(tp.rows[0][11],398.2);assert.equal(tp.hasNextRef,true);
console.log('ex-rights results, next-day reference, equity filter, parsers (new/old TWSE format, signs, ex-rights, no-trade, holiday, wrong date, TPEx), csv and date order tests passed');
