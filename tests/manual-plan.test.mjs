import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fresh,plan} from '../dist/simple-model.js';
import {dailyStatus,summarize} from '../dist/dashboard.js';
import {criticalStartReservations} from '../dist/build-milestones.js';

const seed=JSON.parse(readFileSync(new URL('../dist/seed.json',import.meta.url)));
function fixture(){const s=fresh(seed);s.parts=[];s.weeks=[];s.holidays=[];s.shutdowns=[];s.settings.end='2026-11-16';return s;}
const mix=(thin,thick)=>({thin,thick});

test('manual loads and zero days drive curing and closing stock, then automatic planning resumes',()=>{
 const s=fixture();s.settings.weeklyCarts=2;s.manualLoads={'2026-11-02':mix(1,1),'2026-11-03':mix(0,0)};
 const before=JSON.stringify(s),rows=plan(s);assert.deepEqual(rows[0].load,mix(1,1));assert.deepEqual(rows[1].load,mix(0,0));assert.ok(rows[1].manualPlan);
 assert.deepEqual(rows[3].out,mix(20,0));assert.deepEqual(rows[5].out,mix(0,20));assert.deepEqual(rows[5].inv,mix(20,20));
 assert.equal(rows[7].manualPlan,null);assert.equal(rows[7].load.thin+rows[7].load.thick,2);assert.equal(JSON.stringify(s),before);
});

test('automatic work protects a later manual day from both oven and weekly capacity conflicts',()=>{
 const s=fixture();s.settings.totalCarts=2;s.settings.weeklyCarts=3;s.manualLoads={'2026-11-04':mix(0,2)};
 const rows=plan(s);assert.deepEqual(rows[0].load,mix(0,0));assert.deepEqual(rows[1].load,mix(0,0));assert.deepEqual(rows[2].load,mix(0,2));assert.equal(rows[2].manualPlan.issues.length,0);
 assert.ok(rows.every(r=>r.oven.thin+r.oven.thick<=2));
 s.settings.totalCarts=10;const room=plan(s);assert.equal(room[0].load.thin+room[0].load.thick,1);assert.deepEqual(room[2].load,mix(0,2));assert.equal(room.slice(0,7).reduce((n,r)=>n+r.load.thin+r.load.thick,0),3);
});

test('invalid manual mixes show the conflict, and waterjet shutdown alone still permits an oven load',()=>{
 const s=fixture();s.settings.totalCarts=2;s.initialLoads=[{kind:'thick',carts:2,date:'2026-10-30'}];s.holidays=[{name:'Holiday',start:'2026-11-07',end:'2026-11-07'}];s.shutdowns=[{start:'2026-11-04',end:'2026-11-04'}];
 s.manualLoads={'2026-11-02':mix(0,1),'2026-11-04':mix(1,1),'2026-11-07':mix(1,0)};
 let rows=plan(s);assert.deepEqual(rows[0].load,mix(0,0));assert.match(rows[0].manualPlan.issues.join(' '),/Oven limit/);
 assert.deepEqual(rows[2].load,mix(0,0));assert.match(rows[2].manualPlan.issues.join(' '),/cure would end on a holiday/);
 assert.match(rows[5].manualPlan.issues.join(' '),/Forming is closed/);assert.equal(dailyStatus(rows[0]).label,'Manual plan conflict');assert.equal(summarize(rows).weeks[0].status.tone,'red');
 s.manualLoads['2026-11-04']=mix(0,2);rows=plan(s);assert.equal(rows[2].closed,true);assert.deepEqual(rows[2].out,mix(0,40));assert.deepEqual(rows[2].load,mix(0,2));assert.deepEqual(rows[2].oven,mix(0,2));
});

test('manual cart dates remain fixed in critical forming estimates and survive backup round trips',()=>{
 const s=fixture();s.weeks=[{key:'2026-W46',date:'2026-11-09'}];s.parts=[{id:'A',thickness:'thick',factor:1,qty:{'2026-W46':20},overrides:{},delivery:{'2026-W46':{priority:'critical',leadDays:0}}}];
 s.settings.weeklyCarts=1;s.manualLoads={'2026-11-02':mix(0,1),'2026-11-09':mix(0,0)};
 const backup=JSON.parse(JSON.stringify(s)),rows=plan(backup),order=rows.orderResults[0],estimate=criticalStartReservations(backup,rows);
 assert.deepEqual(rows[0].load,mix(0,1));assert.equal(order.allocations[0].loadDate,'2026-11-02');assert.equal(estimate.reserved.length,0);assert.equal(estimate.groups.get(order.id).startBy,'2026-11-02');
 assert.throws(()=>plan({...s,manualLoads:{'2026-11-02':mix(-1,0)}}),/whole number of carts/);
});
