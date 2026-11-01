// Forward B2/B4 sealing on real data (skips without data). ~1 minute.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {step} from '../research/forward-b.mjs';import {loadPanel} from '../research/lib/data.mjs';import {run,loadB} from '../research/factors-v3.mjs';import {formationDates} from '../scripts/fetch-b.mjs';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!fs.existsSync(path.join(root,'data','b','progress.json'))){console.log('forward-b: no data, skipped');process.exit(0);}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fb-')),opt={dir,startMonth:'2026-09'};
let r=step(root,{...opt,to:'2026-09-11',now:Date.parse('2026-09-11T21:00:00+08:00')});assert.deepEqual(r.sealed,['B2 2026-09','B4 2026-09']);
const b2=JSON.parse(fs.readFileSync(path.join(dir,'b2-2026-09.json'),'utf8')),b4=JSON.parse(fs.readFileSync(path.join(dir,'b4-2026-09.json'),'utf8'));
assert.equal(b2.revenueMonth,'2026-08');assert.ok(b2.picks.length>20&&b4.picks.length>20);
// same groups as the published v3 run for that formation date
const fds=formationDates(JSON.parse(fs.readFileSync(path.join(root,'data','progress.json'),'utf8'))),v3=run(loadPanel(root,{from:'2025-01-01'}),loadB(root),fds).series;
assert.equal(v3.B2.find(x=>x.date==='2026-09-11').selected,b2.picks.length);assert.equal(v3.B4.find(x=>x.date==='2026-09-11').selected,b4.picks.length);
// no overwrite; too late after the next open; never after next-day data
const before=fs.readFileSync(path.join(dir,'b2-2026-09.json'),'utf8');step(root,{...opt,to:'2026-09-11',now:Date.parse('2026-09-11T23:00:00+08:00')});assert.equal(fs.readFileSync(path.join(dir,'b2-2026-09.json'),'utf8'),before);
const d2=fs.mkdtempSync(path.join(os.tmpdir(),'fb-'));r=step(root,{dir:d2,startMonth:'2026-09',to:'2026-09-11',now:Date.parse('2026-09-14T09:30:00+08:00')});assert.deepEqual(r.sealed,[]);assert.deepEqual(r.missed,['B2 2026-09','B4 2026-09']);
const d3=fs.mkdtempSync(path.join(os.tmpdir(),'fb-'));r=step(root,{dir:d3,startMonth:'2026-09',to:'2026-09-14',now:Date.parse('2026-09-11T21:00:00+08:00')});assert.deepEqual(r.sealed,[]);assert.ok(JSON.parse(fs.readFileSync(path.join(d3,'missed-b.json'),'utf8')).includes('B2 2026-09'));
// matured evaluation
step(root,{...opt,to:'2026-10-30',now:Date.parse('2026-10-30T21:00:00+08:00')});const ev=JSON.parse(fs.readFileSync(path.join(dir,'b-evaluation.json'),'utf8')).months;
assert.equal(ev.B2['2026-09-11'].status,'matured');assert.ok(Number.isFinite(ev.B2['2026-09-11'].excessPct)&&Number.isFinite(ev.B4['2026-09-11'].benchmark0050Pct));
console.log('forward-b: sealed before next open with the same groups as v3, no overwrite, missed when late or after next-day data, matured evaluation passed');
