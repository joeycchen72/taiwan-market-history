// Load the daily files into compact per-code arrays and build a total-return index from the official reference price.
import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';
export const COMMON=/^\d{4}$/;// Common stocks only: 4-digit codes, excluding 91xx (TDR) and 00xx (4-digit ETFs such as 0050/0056; SPEC-v1 amendment 2026-10-31, before any result).
export const isCommon=c=>COMMON.test(c)&&!c.startsWith('91')&&!c.startsWith('00');
export function listFiles(root){const out=[];for(const m of ['twse','tpex']){const base=path.join(root,'data',m);if(!fs.existsSync(base))continue;for(const y of fs.readdirSync(base).sort())for(const f of fs.readdirSync(path.join(base,y)).sort())if(/^\d{8}\.csv\.gz$/.test(f))out.push({market:m,date:f.slice(0,4)+'-'+f.slice(4,6)+'-'+f.slice(6,8),file:path.join(base,y,f)});}return out;}
const num=s=>s===''||s===undefined?NaN:Number(s);
export function readDay(file){const lines=zlib.gunzipSync(fs.readFileSync(file)).toString().split('\n').filter(Boolean);const head=lines[0].split(',');const I=Object.fromEntries(head.map((h,i)=>[h,i]));
 return lines.slice(1).map(l=>{const r=l.split(',');return {code:r[I.code],name:r[I.name],o:num(r[I.open]),h:num(r[I.high]),l:num(r[I.low]),c:num(r[I.close]),v:num(r[I.volume]),val:num(r[I.value]),chg:num(r[I.change]),flag:r[I.flag]||'',nref:I.next_ref===undefined?NaN:num(r[I.next_ref])};});}
// Official ex-rights reference prices: TWSE from TWT49U files; TPEx from the previous day's next-day reference price.
export function loadExrights(root){const m=new Map(),base=path.join(root,'data','twse-exright');if(!fs.existsSync(base))return m;for(const y of fs.readdirSync(base))for(const f of fs.readdirSync(path.join(base,y))){const lines=zlib.gunzipSync(fs.readFileSync(path.join(base,y,f))).toString().split('\n').filter(Boolean).slice(1);for(const l of lines){const [date,code,,ref]=l.split(',');if(Number(ref)>0)m.set(date+'|'+code,Number(ref));}}return m;}
// keep(code) filters which codes to store (default: common stocks plus 0050)
export function loadPanel(root,{from='0000',to='9999',keep=c=>isCommon(c)||c==='0050'}={}){
 const files=listFiles(root).filter(f=>f.date>=from&&f.date<=to),dates=[...new Set(files.map(f=>f.date))].sort(),D=dates.length,di=new Map(dates.map((d,i)=>[d,i])),S=new Map();
 const make=(market)=>({market,o:new Float32Array(D).fill(NaN),h:new Float32Array(D).fill(NaN),l:new Float32Array(D).fill(NaN),c:new Float32Array(D).fill(NaN),val:new Float32Array(D).fill(NaN),chg:new Float32Array(D).fill(NaN),x:new Uint8Array(D),ref:new Float32Array(D).fill(NaN),nref:new Float32Array(D).fill(NaN)});
 for(const f of files){const t=di.get(f.date);for(const r of readDay(f.file)){if(!keep(r.code))continue;let s=S.get(r.code);if(!s){s=make(f.market);S.set(r.code,s);}s.o[t]=r.o;s.h[t]=r.h;s.l[t]=r.l;s.c[t]=r.c;s.val[t]=r.val;s.chg[t]=r.chg;s.x[t]=r.flag==='X'?1:0;s.nref[t]=r.nref;}}
 const ex=loadExrights(root);for(const [code,s] of S)for(let t=0;t<D;t++){const o=ex.get(dates[t]+'|'+code);if(o>0)s.ref[t]=o;else if(t>0&&s.nref[t-1]>0)s.ref[t]=s.nref[t-1];}
 for(const s of S.values())buildIndex(s,D);
 return {dates,di,series:S};}
// tri: total-return index (carries forward on no-trade days); unk[t]=1 when that day's return cannot be taken from the reference price
export function buildIndex(s,D){s.tri=new Float64Array(D).fill(NaN);s.unk=new Uint8Array(D);let last=NaN,lastClose=NaN;
 for(let t=0;t<D;t++){const c=s.c[t];if(!(c>0)){s.tri[t]=last;continue;}
  if(!(last>0)){last=1;}else{const official=s.ref?.[t],ref=s.x[t]?official:c-s.chg[t];if(!(ref>0)){s.unk[t]=1;last*=c/lastClose;}else last*=c/ref;}
  s.tri[t]=last;lastClose=c;}
 s.factor=t=>s.c[t]>0?s.tri[t]/s.c[t]:NaN;return s;}
