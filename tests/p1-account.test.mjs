// P1 experimental account: equal-weight next-open entry, 21-day hold, SPEC-v6 costs; matches forward() returns.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {build,P1A} from '../research/p1-account.mjs';import {loadPanel} from '../research/lib/data.mjs';import {prepare} from '../research/factors-v2.mjs';import {forward} from '../research/factors-v1.mjs';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!fs.existsSync(path.join(root,'data','progress.json'))){console.log('p1-account: no data, skipped');process.exit(0);}
const panel=prepare(loadPanel(root,{from:'2026-07-01'})),{di,series,dates}=panel,D=dates.length;
const codes=['2330','2317','2454','2412','2308','2881'],L={formationDate:'2026-09-16',picks:codes.map(code=>({code}))};
const a=build(panel,[L]),t=di.get('2026-09-16');assert.equal(a.validated,false);assert.equal(a.periods[0].status,'closed');
const r=codes.map(c=>forward(series.get(c),t,P1A.hold,D).r),mean=r.reduce((x,y)=>x+y,0)/r.length;
const want=P1A.capital/(1+P1A.buyCost)*(1+mean)*(1-P1A.sellCost);assert.ok(Math.abs(a.periods[0].navAfter-want)<2,a.periods[0].navAfter+' vs '+want);
assert.equal(a.periods[0].entryDate,dates[t+1]);assert.equal(a.periods[0].exitDate,dates[t+21]);
// second list formed before the first exits waits; a list formed on the last data day waits for entry
const b=build(panel,[L,{formationDate:dates[t+5],picks:codes.slice(0,3).map(code=>({code}))},{formationDate:dates[D-1],picks:[{code:'2330'}]}]);
assert.equal(b.periods[1].delayed,true);assert.equal(b.periods[1].entryDate,dates[t+22]);assert.equal(b.periods[2].status,'waiting for entry');
assert.equal(b.marks.at(-1).date,dates[D-1]);assert.ok(b.bench>0);
console.log('p1-account: equal-weight next-open entry, 21-day hold, costs = SPEC-v6, overlapping lists wait, unentered lists wait; passed');
