import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import zlib from 'node:zlib';
import {loadPanel,buildIndex} from '../research/lib/data.mjs';
import {features,forward,judge,interval,monthly,SPEC} from '../research/factors-v1.mjs';
import {runChecks} from '../research/data-checks.mjs';
// --- total-return index from the reference price: an ex-dividend drop is not a loss
const s={c:Float32Array.from([100,98,99]),chg:Float32Array.from([0,1,1]),x:new Uint8Array(3),o:Float32Array.from([100,98,99]),h:Float32Array.from([100,98,99]),l:Float32Array.from([100,98,99]),val:new Float32Array(3)};
// day1: close 98, change +1 => reference 97 (prev close 100 minus 3 dividend); day2: close 99, change +1 => ref 98
buildIndex(s,3);assert.ok(Math.abs(s.tri[1]-98/97)<1e-6);assert.ok(Math.abs(s.tri[2]-(98/97)*(99/98))<1e-6);assert.equal(s.unk[1],0);
const sx={...s,x:Uint8Array.from([0,1,0])};buildIndex(sx,3);assert.equal(sx.unk[1],1,'not-compared day without official reference is unknown');
const so={...s,x:Uint8Array.from([0,1,0]),ref:Float32Array.from([NaN,97,NaN])};buildIndex(so,3);assert.equal(so.unk[1],0);assert.ok(Math.abs(so.tri[1]-98/97)<1e-6,'official ex-rights reference price used');
// --- synthetic market on disk
const root=fs.mkdtempSync(path.join(os.tmpdir(),'mh-'));let seed=11;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const days=[];for(let t=Date.parse('2015-01-01T00:00:00Z');days.length<330;t+=86400000){const d=new Date(t);if(d.getUTCDay()%6)days.push(d.toISOString().slice(0,10));}
const codes=Array.from({length:80},(_,i)=>String(1101+i)),price=Object.fromEntries(codes.map(c=>[c,50]));const progress={version:1,markets:{twse:{},tpex:{}},failures:{}};
const head='code,name,open,high,low,close,volume,value,trades,change,flag';
days.forEach((d,i)=>{const lines=[head];for(const c of codes){if(c==='1180'&&i>200)continue;const p0=price[c],p1=Math.max(5,p0*(1+(rnd()-.5)*.04));price[c]=p1;const chg=(p1-p0).toFixed(2);lines.push([c,'n',p0.toFixed(2),Math.max(p0,p1).toFixed(2)*1+0.1,Math.min(p0,p1).toFixed(2)-0.1,p1.toFixed(2),1e6,(p1*1e6).toFixed(0),100,chg,''].join(','));}
 const dir=path.join(root,'data','twse',d.slice(0,4));fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,d.replace(/-/g,'')+'.csv.gz'),zlib.gzipSync(lines.join('\n')+'\n'));progress.markets.twse[d]='ok:'+codes.length;progress.markets.tpex[d]='closed';});
fs.writeFileSync(path.join(root,'data','progress.json'),JSON.stringify(progress));
const panel=loadPanel(root);assert.equal(panel.dates.length,330);const a=panel.series.get('1101');
// features only use the past
const f1=features(a,280);const saved=a.tri[300];a.tri[300]=999;assert.deepEqual(features(a,280),f1);a.tri[300]=saved;
// forward: not matured -> null; unknown day inside -> excluded; delisted code exits at last close
assert.equal(forward(a,325,21,330),null);a.unk[100]=1;assert.deepEqual(forward(a,95,10,330),{excluded:true});a.unk[100]=0;
const d=panel.series.get('1180'),fw=forward(d,195,21,330);assert.equal(fw.delistExit,true);assert.ok(Number.isFinite(fw.r));
// data checks run and report (synthetic data is small, so thresholds fail as designed)
const chk=runChecks(root);assert.equal(chk.C2.pass,false);assert.equal(chk.C1.pass,false,'tpex closed while twse open -> flagged');assert.ok('C5' in chk&&'C6' in chk);
// verdict thresholds
const mk=(from,n,m)=>Array.from({length:n},(_,i)=>({date:new Date(Date.parse(from+'T00:00:00Z')+i*31*86400000).toISOString().slice(0,10),excess:m+(i%2?.002:-.002),n:10}));
const series=v=>[...mk('2015-01-01',60,.01),...mk('2020-01-01',36,.01),...mk('2023-01-01',36,v)];
assert.ok(judge(series(.02),'t').verdict.startsWith('通過，且超額大於來回成本'));assert.ok(judge(series(.003),'t').verdict.startsWith('通過，但'));assert.equal(judge(series(-.01),'t').verdict,'未通過');
const flip=[...mk('2015-01-01',60,-.01),...mk('2020-01-01',36,.01),...mk('2023-01-01',36,.02)];assert.equal(judge(flip,'t').verdict,'未通過','design must also be positive');
assert.equal(monthly([{date:'2023-01-03',excess:.01},{date:'2023-01-20',excess:.03}])[0].excess,.02);assert.equal(interval([1,2],'t'),null);
assert.ok(Object.isFrozen(SPEC));assert.equal(Object.keys(SPEC.tests).length,6);
fs.rmSync(root,{recursive:true,force:true});
console.log('research: reference-price total return, unknown days, past-only features, maturity/exclusion/delist exits, data checks and verdict thresholds passed');
