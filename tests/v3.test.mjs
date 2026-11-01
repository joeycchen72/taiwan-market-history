// SPEC-v3: B data loads; groups never change when only prices after the formation date change.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadPanel} from '../research/lib/data.mjs';import {run,loadB} from '../research/factors-v3.mjs';import {formationDates} from '../scripts/fetch-b.mjs';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!fs.existsSync(path.join(root,'data','b','revenue-sii'))){console.log('v3: no B data, skipped');process.exit(0);}
const daily=JSON.parse(fs.readFileSync(path.join(root,'data','progress.json'),'utf8')),fds=formationDates(daily).filter(x=>x.date>='2025-01-01'),B=loadB(root);
const r=B('revenue','2026-09');if(r){const tsmc=r.get('2330');assert.ok(tsmc&&tsmc.rev>0&&tsmc.industry,'2330 revenue with industry');}
const q=B('qfii',fds.at(-1).date);if(q){assert.ok(q.get('2330')?.issued>2e10,'2330 shares issued');}
const build=after=>{const p=loadPanel(root,{from:'2024-01-01'});if(after){const T=p.di.get(after);let i=0;for(const s of p.series.values()){const k=1.29+0.07*((i++)%5);for(let t=T+1;t<p.dates.length;t++){for(const a of ['o','h','l','c'])s[a][t]*=k;s.tri[t]*=k;s.val[t]*=k;}}}return p;};
const cut=fds.at(-3).date,A=run(build(),B,fds).series,Z=run(build(cut),B,fds).series;let n=0;
for(const k of Object.keys(A))for(const x of A[k]){if(x.date>cut)continue;const y=Z[k].find(v=>v.date===x.date);assert.ok(y,k+' '+x.date);assert.equal(y.selected,x.selected,k+' selected');assert.equal(y.universe,x.universe,k+' universe');n++;}
assert.ok(n>0);console.log('v3: B data loads (revenue+industry, shares issued); '+n+' group formations unchanged when only later prices change');
