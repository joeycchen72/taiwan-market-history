// Official end-of-day quotes for one date, all securities in one request per market (includes later-delisted stocks).
// TWSE: MI_INDEX (2004-02-11 onward). TPEx: dailyQuotes. Raw, unadjusted prices plus the official change, so that
// the exchange reference price (close - change; ex-rights/ex-dividend days are flagged) can be recovered later.
export const COLUMNS=['code','name','open','high','low','close','volume','value','trades','change','flag','next_ref'];
export const EXRIGHT_COLUMNS=['date','code','prev_close','ref_price','value','type'];
const num=v=>{const s=String(v??'').replace(/,/g,'').trim();if(!s||s==='--'||s==='---'||s==='----')return null;const n=Number(s);return Number.isFinite(n)?n:null;};
const strip=v=>String(v??'').replace(/<[^>]*>/g,'').trim();
const idx=(fields,...names)=>{for(const n of names){const i=fields.findIndex(f=>strip(f).replace(/\s/g,'').startsWith(n));if(i>=0)return i;}return -1;};
export const ymd=d=>d.replace(/-/g,'');
// Keep stocks (4 digits) and ETFs (00 + 2-4 digits, optional letter). Drops warrants, bonds, preferred shares and ETNs.
export const EQUITY=/^(\d{4}|00\d{2,4}[A-Z]?)$/;
export const keepEquity=rows=>rows.filter(r=>EQUITY.test(r[0]));
// TWSE MI_INDEX json; returns {status:'ok'|'closed', rows}
export function parseTwse(j,date){
 const stat=String(j?.stat||'');if(!/^ok$/i.test(stat)){if(/沒有符合|查詢日期|無資料|no data/i.test(stat+JSON.stringify(j?.notes||'')))return {status:'closed',rows:[]};throw Error('TWSE stat: '+stat.slice(0,60));}
 let tables=Array.isArray(j.tables)?j.tables.map(t=>({fields:t.fields||[],data:t.data||[]})):[];
 for(let k=1;k<=12;k++)if(j['fields'+k])tables.push({fields:j['fields'+k],data:j['data'+k]||[]});
 const t=tables.find(t=>idx(t.fields,'證券代號')>=0&&idx(t.fields,'收盤價')>=0&&t.data.length);if(!t)return {status:'closed',rows:[]};
 const f=t.fields,I={code:idx(f,'證券代號'),name:idx(f,'證券名稱'),vol:idx(f,'成交股數'),trades:idx(f,'成交筆數'),value:idx(f,'成交金額'),open:idx(f,'開盤價'),high:idx(f,'最高價'),low:idx(f,'最低價'),close:idx(f,'收盤價'),sign:idx(f,'漲跌(+/-)','漲跌'),chg:idx(f,'漲跌價差')};
 if(j.date&&String(j.date)!==ymd(date))throw Error('TWSE returned another date '+j.date);
 const rows=t.data.map(r=>{const sign=strip(r[I.sign]),c=num(r[I.chg]),flag=/X/i.test(sign)?'X':'';const change=c===null?null:sign.includes('-')?-c:sign.includes('+')?c:/X/i.test(sign)?null:0;
  return [strip(r[I.code]),strip(r[I.name]).replace(/,/g,' '),num(r[I.open]),num(r[I.high]),num(r[I.low]),num(r[I.close]),num(r[I.vol]),num(r[I.value]),num(r[I.trades]),change,flag,null];}).filter(r=>r[0]);
 return {status:'ok',rows};
}
// TPEx dailyQuotes json
export function parseTpex(j,date){
 const stat=String(j?.stat||'');const t=(j?.tables||[]).find(t=>idx(t.fields||[],'代號')>=0&&idx(t.fields||[],'收盤')>=0);
 if(!/^ok$/i.test(stat)&&!t)throw Error('TPEx stat: '+stat.slice(0,60));
 if(!t||!(t.data||[]).length)return {status:'closed',rows:[]};
 if(j.date&&String(j.date).replace(/\D/g,'')!==ymd(date))throw Error('TPEx returned another date '+j.date);
 const f=t.fields,I={code:idx(f,'代號'),name:idx(f,'名稱'),close:idx(f,'收盤'),chg:idx(f,'漲跌'),open:idx(f,'開盤'),high:idx(f,'最高'),low:idx(f,'最低'),vol:idx(f,'成交股數'),value:idx(f,'成交金額'),trades:idx(f,'成交筆數'),next:idx(f,'次日參考價')};
 const rows=t.data.map(r=>{const raw=strip(r[I.chg]),flag=/除|X/i.test(raw)?'X':'',c=num(raw.replace(/[^\d.+-]/g,''));return [strip(r[I.code]),strip(r[I.name]).replace(/,/g,' '),num(r[I.open]),num(r[I.high]),num(r[I.low]),num(r[I.close]),num(r[I.vol]),num(r[I.value]),num(r[I.trades]),flag?null:c,flag,I.next>=0?num(r[I.next]):null];}).filter(r=>r[0]);
 return {status:'ok',rows,hasNextRef:I.next>=0};
}
// TWSE ex-rights/ex-dividend results (TWT49U): official reference price on the ex date
const roc=v=>{const m=String(v||'').match(/(\d{2,3})\D+(\d{1,2})\D+(\d{1,2})/);return m?(+m[1]+1911)+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0'):null;};
export function parseTwt49u(j){const stat=String(j?.stat||'');const tables=Array.isArray(j?.tables)?j.tables:[{fields:j?.fields||[],data:j?.data||[]}],t=tables.find(t=>idx(t.fields||[],'股票代號')>=0&&idx(t.fields||[],'除權息參考價')>=0);
 if(!t){if(/沒有符合|無資料/.test(stat)||/^ok$/i.test(stat))return {status:'empty',rows:[]};throw Error('TWT49U stat: '+stat.slice(0,60));}
 const f=t.fields,I={date:idx(f,'資料日期'),code:idx(f,'股票代號'),prev:idx(f,'除權息前收盤價'),ref:idx(f,'除權息參考價'),val:idx(f,'權值+息值','權值'),type:idx(f,'權/息')};
 return {status:'ok',rows:(t.data||[]).map(r=>[roc(r[I.date]),strip(r[I.code]),num(r[I.prev]),num(r[I.ref]),num(r[I.val]),strip(r[I.type])]).filter(r=>r[0]&&r[1]&&r[3]>0)};}
export const urls={
 twse:d=>'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date='+ymd(d)+'&type=ALLBUT0999&response=json',
 tpex:d=>'https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date='+d.replace(/-/g,'/')+'&response=json',
 twseExright:m=>{const [y,mo]=m.split('-').map(Number),last=new Date(Date.UTC(y,mo,0)).getUTCDate();return 'https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate='+y+String(mo).padStart(2,'0')+'01&endDate='+y+String(mo).padStart(2,'0')+String(last).padStart(2,'0')+'&response=json';}
};
export function toCsv(rows,cols=COLUMNS){const esc=v=>v===null||v===undefined?'':String(v);return cols.join(',')+'\n'+rows.map(r=>r.map(esc).join(',')).join('\n')+'\n';}
