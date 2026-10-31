// Forward H5 sealing rules on the real downloaded data (skips when data is absent).
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {step,sealDeadline} from '../research/forward-h5.mjs';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
assert.equal(new Date(sealDeadline('2026-11-02')).toISOString(),'2026-11-03T01:00:00.000Z');assert.equal(new Date(sealDeadline('2026-10-30')).toISOString(),'2026-11-02T01:00:00.000Z');
if(!fs.existsSync(path.join(root,'data','twse','2026'))){console.log('forward: no data, sealing-rule unit checks only passed');process.exit(0);}
const progress=JSON.parse(fs.readFileSync(path.join(root,'data','progress.json'),'utf8'));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fwd-')),opt={progress,dir,startMonth:'2026-09'};
// 1) data ends on the month's first trading day, before the next open: sealed
let r=step(root,{...opt,to:'2026-09-01',now:Date.parse('2026-09-01T22:00:00+08:00')});assert.equal(r.sealed,'2026-09');
const a=JSON.parse(fs.readFileSync(path.join(dir,'h5-2026-09.json'),'utf8'));assert.equal(a.formationDate,'2026-09-01');assert.ok(a.picks.length>=30&&a.picks.length<=a.ranked*0.1+1,'top 10%');assert.ok(a.pool.includes(a.picks[0].code));
assert.equal(a.picks.some(p=>p.code.startsWith('00')),false,'no ETFs');
// 2) never re-sealed or overwritten
const before=fs.readFileSync(path.join(dir,'h5-2026-09.json'),'utf8');r=step(root,{...opt,to:'2026-09-01',now:Date.parse('2026-09-01T23:00:00+08:00')});assert.equal(r.sealed,null);assert.equal(fs.readFileSync(path.join(dir,'h5-2026-09.json'),'utf8'),before);
// 3) after the next session's open it is too late: missed, not sealed
const dir2=fs.mkdtempSync(path.join(os.tmpdir(),'fwd-'));r=step(root,{...opt,dir:dir2,to:'2026-09-01',now:Date.parse('2026-09-02T09:30:00+08:00')});assert.equal(r.sealed,null);assert.deepEqual(r.missed,['2026-09']);
// 4) once the next day's data exists it is never sealed afterwards
const dir3=fs.mkdtempSync(path.join(os.tmpdir(),'fwd-'));r=step(root,{...opt,dir:dir3,to:'2026-09-02',now:Date.parse('2026-09-01T20:00:00+08:00')});assert.equal(r.sealed,null);assert.deepEqual(r.missed,['2026-09']);
// 5) evaluation after 21 trading days uses next open in, close out, versus the rest of the pool and 0050
r=step(root,{...opt,to:'2026-10-30',now:Date.parse('2026-10-30T20:00:00+08:00')});const ev=JSON.parse(fs.readFileSync(path.join(dir,'h5-evaluation.json'),'utf8')).months['2026-09-01'];
assert.equal(ev.status,'matured');assert.ok(Number.isFinite(ev.excessPct)&&Number.isFinite(ev.benchmark0050Pct));assert.ok(ev.picksCounted>0&&ev.restCounted>ev.picksCounted);
console.log('forward: seal before next open, no overwrite, missed after open or after next-day data, ETF-free picks and matured evaluation passed',JSON.stringify(ev));
