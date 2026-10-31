// v1.1: the selected group and the candidate universe must not change when only FUTURE data changes (Issue #12).
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadPanel} from '../research/lib/data.mjs';import {run} from '../research/factors-v1.1.mjs';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!fs.existsSync(path.join(root,'data','twse','2026'))){console.log('selection-first: no data, skipped');process.exit(0);}
const panel=loadPanel(root,{from:'2025-06-01'}),base=run(panel).series.H5,last=base.at(-1),t=panel.di.get(last.date);
// poison the future of every stock: unknown day right after formation, no change at or before t
let i=0;for(const s of panel.series.values()){if(i++%2===0)s.unk[t+2]=1;}
const after=run(panel).series.H5,same=after.find(x=>x.date===last.date);
assert.ok(same,'half poisoned: still evaluable');if(same){assert.equal(same.selected,last.selected,'selected count fixed before forward returns');assert.ok(same.n<last.n,'unevaluable picks dropped, not replaced');assert.equal(same.universe,last.universe,'universe fixed before forward returns');}
else console.log('formation fully unevaluable after poisoning (no replacement picks) — acceptable');
for(const x of after)if(x.date<last.date){const b=base.find(y=>y.date===x.date);if(b&&panel.di.get(x.date)+21<t+2){assert.equal(x.selected,b.selected);assert.equal(x.universe,b.universe);}}
console.log('selection-first: future-only changes never alter selection or universe passed');
