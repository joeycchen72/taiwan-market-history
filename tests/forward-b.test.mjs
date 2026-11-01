// Forward B4 (v3, sample date >= 11th) and B2 (v3.1, decision date >= 16th) sealing on real data (skips without data). ~2 minutes.
import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {step} from '../research/forward-b.mjs';import {loadPanel} from '../research/lib/data.mjs';import {run as run3,loadB} from '../research/factors-v3.mjs';import {run as run31} from '../research/factors-v3.1.mjs';import {formationDates} from '../scripts/fetch-b.mjs';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!fs.existsSync(path.join(root,'data','b','progress.json'))){console.log('forward-b: no data, skipped');process.exit(0);}
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fb-')),opt={dir,startMonth:'2026-09',requireRefetch:false};
let r=step(root,{...opt,to:'2026-09-11',now:Date.parse('2026-09-11T21:00:00+08:00')});assert.deepEqual(r.sealed,['B4 2026-09']);
r=step(root,{...opt,to:'2026-09-16',now:Date.parse('2026-09-16T21:00:00+08:00')});assert.deepEqual(r.sealed,['B2 2026-09']);
const b2=JSON.parse(fs.readFileSync(path.join(dir,'b2-2026-09.json'),'utf8')),b4=JSON.parse(fs.readFileSync(path.join(dir,'b4-2026-09.json'),'utf8'));
assert.equal(b2.formationDate,'2026-09-16');assert.equal(b2.revenueMonth,'2026-08');assert.equal(b4.formationDate,'2026-09-11');
const fds=formationDates(JSON.parse(fs.readFileSync(path.join(root,'data','progress.json'),'utf8'))),B=loadB(root);
assert.equal(run3(loadPanel(root,{from:'2025-01-01'}),B,fds).series.B4.find(x=>x.date==='2026-09-11').selected,b4.picks.length,'B4 = v3 group');
assert.equal(run31(loadPanel(root,{from:'2025-01-01'}),B,fds).series.B2.find(x=>x.date==='2026-09-16').selected,b2.picks.length,'B2 = v3.1 group');
const before=fs.readFileSync(path.join(dir,'b2-2026-09.json'),'utf8');step(root,{...opt,to:'2026-09-16',now:Date.parse('2026-09-16T23:00:00+08:00')});assert.equal(fs.readFileSync(path.join(dir,'b2-2026-09.json'),'utf8'),before,'no overwrite');
const d2=fs.mkdtempSync(path.join(os.tmpdir(),'fb-'));r=step(root,{...opt,dir:d2,to:'2026-09-16',now:Date.parse('2026-09-17T09:30:00+08:00')});assert.ok(r.missed.includes('B2 2026-09'),'too late after next open');
const d3=fs.mkdtempSync(path.join(os.tmpdir(),'fb-'));step(root,{...opt,dir:d3,to:'2026-09-17',now:Date.parse('2026-09-16T21:00:00+08:00')});assert.ok(JSON.parse(fs.readFileSync(path.join(d3,'missed-b.json'),'utf8')).includes('B2 2026-09'),'never after next-day data');
const d4=fs.mkdtempSync(path.join(os.tmpdir(),'fb-'));r=step(root,{dir:d4,startMonth:'2026-09',to:'2026-09-16',now:Date.parse('2026-09-16T21:00:00+08:00')});assert.deepEqual(r.sealed,[],'live mode waits for the revenue re-fetch');
step(root,{...opt,to:'2026-10-30',now:Date.parse('2026-10-30T21:00:00+08:00')});const ev=JSON.parse(fs.readFileSync(path.join(dir,'b-evaluation.json'),'utf8')).months;
assert.equal(ev.B4['2026-09-11'].status,'matured');assert.equal(ev.B2['2026-09-16'].status,'matured');
console.log('forward-b: B4 on the >=11th sample date (= v3), B2 on the >=16th decision date after the revenue re-fetch (= v3.1); no overwrite; missed when late; matured evaluation passed');
