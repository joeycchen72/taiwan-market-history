// SPEC-v2: changing only prices AFTER day T must not change any group or universe formed on or before T.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {loadPanel,isCommon} from '../research/lib/data.mjs';import {prepare,crossTests} from '../research/factors-v2.mjs';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!fs.existsSync(path.join(root,'data','twse','2026'))){console.log('v2-no-lookahead: no data, skipped');process.exit(0);}
const build=poisonAfter=>{const p=loadPanel(root,{from:'2025-01-01'});if(poisonAfter!==undefined){let i=0;for(const s of p.series.values()){const k=1.37+0.11*((i++)%7);for(let t=poisonAfter+1;t<p.dates.length;t++){for(const a of ['o','h','l','c'])s[a][t]*=k;s.tri[t]*=k*(1+0.03*Math.sin(t));s.val[t]*=k;}}}
 prepare(p);p.codes=[...p.series.keys()].filter(isCommon).sort();return p;};
const base=build(),T=base.dates.length-15,poisoned=build(T),A=crossTests(base),B=crossTests(poisoned),cut=base.dates[T];
let checked=0;for(const k of Object.keys(A)){const m=new Map(B[k].series.map(x=>[x.date,x]));for(const x of A[k].series){if(x.date>cut)continue;const y=m.get(x.date);assert.ok(y,k+' '+x.date+' formation disappeared');assert.equal(y.selected,x.selected,k+' '+x.date+' selected');assert.equal(y.universe,x.universe,k+' '+x.date+' universe');checked++;}}
assert.ok(checked>50);console.log('v2-no-lookahead: '+checked+' formations unchanged when only later prices change');
