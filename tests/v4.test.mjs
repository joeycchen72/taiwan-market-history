import test from 'node:test';import assert from 'node:assert/strict';
import {SPEC,signal,trade,run} from '../research/factors-v4.mjs';
const mk=(closes)=>({close:Float64Array.from(closes),open:Float64Array.from(closes),unk:new Uint8Array(closes.length)});
test('C1 fires on a -5% close and enters next open',()=>{const c=Array.from({length:400},(_,i)=>100*1.0005**i);c[300]=c[299]*0.94;for(let i=301;i<400;i++)c[i]=c[300]*1.0005**(i-300);
 const px=mk(c),dates=c.map((_,i)=>'D'+String(i).padStart(4,'0'));assert.equal(signal('C1',px.close,300),true);assert.equal(signal('C1',px.close,301),false);
 const r=run(dates,px).rules.find(x=>x.id==='C1');assert.equal(r.n,1);assert.equal(r.events[0].entry,dates[301]);assert.equal(r.events[0].exit,dates[320]);assert.equal(r.verdict,'樣本不足，無法判斷');});
test('signal never reads beyond t',()=>{const c=Array.from({length:300},()=>100);const a=Float64Array.from(c);const before=signal('C3',a,280);a[281]=1;assert.equal(signal('C3',a,280),before);a[281]=100;});
test('C3 only fires on the first crossing',()=>{const c=[...Array(260).fill(100),84,83,82,90,84];const px=mk(c);assert.equal(signal('C3',px.close,260),true);assert.equal(signal('C3',px.close,261),false);});
test('costs are charged and unmatured trades are null',()=>{const px=mk(Array(50).fill(100));const t=trade(px,10,20);assert.ok(t.ret<0&&t.ret>-0.006);assert.equal(trade(px,40,20),null);});
