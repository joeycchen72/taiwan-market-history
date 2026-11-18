// SPEC-v7 mechanics on synthetic data: drawdown window, non-overlapping events, next-day entry, forward return.
import assert from 'node:assert/strict';import {drawdown,events} from '../research/factors-v7.mjs';
const tri=[100,110,120,108,100,102,104,130,131,132,120,121,122,123];const dd=drawdown(tri,3);
assert.ok(Number.isNaN(dd[1]));assert.equal(+dd[3].toFixed(4),-0.1);assert.equal(+dd[4].toFixed(4),+(100/120-1).toFixed(4));
const ev=events(tri,dd,.09,2);assert.deepEqual(ev.map(e=>e.t),[3,10]);assert.equal(+ev[0].r.toFixed(4),+(104/100-1).toFixed(4),'enter next day, hold 2');
assert.equal(events(tri,dd,.09,7).length,1,'events do not overlap within H');
console.log('v7: drawdown window, next-day entry, non-overlap passed');
