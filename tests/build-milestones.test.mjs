import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fresh,plan,dateNum,dateStr,weekKey,validate} from '../dist/simple-model.js';
import {criticalMilestones,criticalStartReservations,supplyLedger} from '../dist/build-milestones.js';
import {BUILD_STEPS,buildRoute,downstreamMilestones,latestAkroDate} from '../dist/downstream.js';
import {deliveryResults} from '../dist/delivery.js';
import {milestoneCsv} from '../dist/milestone-view.js';
const seed=JSON.parse(readFileSync(new URL('../dist/seed.json',import.meta.url)));
const hours={lamination:5,waterjet:5,staging:20,assembly:10,qc:10,shipping:10};
const route={hours,total:50,complete:true};
function small(){const s=fresh(seed);s.settings.start='2026-11-02';s.settings.end='2026-12-27';s.parts=[{id:'A',thickness:'thick',factor:4,qty:{'2026-W49':78,'2026-W50':60,'2026-W51':60},overrides:{},delivery:Object.fromEntries(['2026-W49','2026-W50','2026-W51'].map(week=>[week,{priority:'critical',leadDays:6}]))}];s.initialLoads=[{kind:'thick',carts:3,date:'2026-11-01'}];return s;}
test('whole-order step times share 10-hour shifts and yield a consistent required Akro date',()=>{
 const s=small(),x=downstreamMilestones(s,'2026-11-30',route);
 assert.equal(x.finish,'2026-12-05');assert.equal(x.steps[0].start,'2026-12-01');assert.equal(x.steps[1].finish,'2026-12-01');assert.equal(x.steps[2].finish,'2026-12-03');assert.equal(latestAkroDate(s,'2026-12-05',route),'2026-11-30');
});
test('holidays and waterjet shutdowns delay relevant steps, with no finish on a closed shift',()=>{
 const s=small();s.shutdowns=[{start:'2026-11-28',end:'2026-11-29'}];const x=downstreamMilestones(s,'2026-11-24',route);
 assert.equal(x.steps[0].start,'2026-11-28');assert.equal(x.steps[1].start,'2026-11-30');assert.equal(x.finish,'2026-12-04');
 for(const step of x.steps)for(const date of [step.start,step.finish])assert.ok(!s.holidays.some(h=>date>=h.start&&date<=h.end));
 assert.equal(latestAkroDate(s,x.finish,route),'2026-11-24');
});
test('all-zero steps explicitly bypass the route and incomplete steps preserve the existing lead allowance',()=>{
 const s=small(),p=s.parts[0],o=plan(s).orderResults[0];assert.equal(o.lead,6);assert.equal(o.route.complete,false);
 s.settings.stepHours={...hours,qc:null};assert.equal(buildRoute(s,p,'2026-W49').complete,false);assert.equal(plan(s).orderResults[0].needBy,o.needBy);
 s.settings.stepHours=Object.fromEntries(BUILD_STEPS.map(([k])=>[k,0]));const r=buildRoute(s,p,'2026-W49');assert.ok(r.complete);assert.equal(downstreamMilestones(s,'2026-12-06',r).finish,'2026-12-06');assert.equal(latestAkroDate(s,'2026-12-06',r),'2026-12-06');
});
test('order overrides inherit default times without overwriting demand or calendar-day inputs',()=>{
 const s=small();s.settings.stepHours=hours;s.parts[0].delivery['2026-W49'].stepHours={waterjet:15,shipping:0};
 const before=JSON.stringify(s),r=plan(s),o=r.orderResults.find(o=>o.week==='2026-W49');assert.equal(o.route.hours.lamination,5);assert.equal(o.route.hours.waterjet,15);assert.equal(o.route.hours.shipping,undefined);assert.equal(o.route.total,60);assert.equal(JSON.stringify(s),before);assert.equal(s.parts[0].delivery['2026-W49'].leadDays,6);
 assert.equal(deliveryResults(r).find(x=>x.id===o.id).projected,o.batchFlow.finish);assert.ok(o.batchFlow.steps[0].start<=o.ready);assert.ok(o.batchFlow.finish<downstreamMilestones(s,o.ready,o.route).finish);
});
test('negative, non-finite and malformed step times are rejected without requiring a new backup schema',()=>{
 for(const value of [{qc:-1},{qc:NaN},{qc:3651},[],5]){const s=small();s.settings.stepHours=value;assert.throws(()=>validate(s),/Step times|step times/);}
 const s=small();s.parts[0].delivery['2026-W49'].stepHours={assembly:-1};assert.throws(()=>validate(s),/Step times/);assert.equal(s.version,2);
});
test('physical lot tracing accounts for every released sheet once, including opening oven supply',()=>{
 const s=small(),r=plan(s),o=r.orderResults[0],lots=new Map();
 for(const order of r.orderResults){assert.equal(order.allocations.reduce((n,a)=>n+a.quantity,0),order.filled);for(const a of order.allocations){assert.ok(!a.untracked);lots.set(a.id,(lots.get(a.id)||0)+a.quantity);}}
 assert.ok([...lots.values()].every(n=>n<=20));assert.equal(o.allocations.filter(a=>a.opening).reduce((n,a)=>n+a.quantity,0),60);
 const m=criticalMilestones(s,r).get(o.id);assert.equal(m.openingPanels,60);assert.equal(m.newPanels,252);assert.ok(m.formingStart);assert.ok(m.formingFinish);assert.ok(m.finalCure<=o.ready);
});
test('joint start-by reservations respect daily, weekly, thickness and total limits and exact holiday cures',()=>{
 const s=small(),rows=plan(s),before=JSON.stringify({s,rows}),r=criticalStartReservations(s,rows);assert.equal(r.feasible,true);assert.ok(r.reserved.length>0);
 const removed=new Set(r.reserved.map(x=>x.id)),daily=new Map(),weekly=new Map(),occupied=new Map(rows.map(row=>[row.date,{...row.oven}]));
 for(const row of rows)daily.set(row.date,row.load.thin+row.load.thick);
 for(const j of r.reserved){const original=dateStr(j.original);daily.set(original,daily.get(original)-1);for(let day=j.original;day<j.original+s.settings[j.kind+'Cure'];day++){const a=occupied.get(dateStr(day));if(a)a[j.kind]--;}}
 for(const j of r.reserved){daily.set(j.date,daily.get(j.date)+1);assert.ok(dateNum(j.out)<=j.due);assert.equal(dateNum(j.out)-dateNum(j.date),s.settings[j.kind+'Cure']);assert.ok(!s.holidays.some(h=>[j.date,j.out].some(d=>d>=h.start&&d<=h.end)));for(let day=dateNum(j.date);day<dateNum(j.out);day++)occupied.get(dateStr(day))[j.kind]++;}
 for(const [date,n] of daily){assert.ok(n<=s.settings.dailyCarts);const wk=weekKey(date);weekly.set(wk,(weekly.get(wk)||0)+n);}
 assert.ok([...weekly.values()].every(n=>n<=s.settings.weeklyCarts));for(const a of occupied.values()){assert.ok(a.thin+a.thick<=10);assert.ok(a.thick<=s.settings.thickCarts);assert.ok(a.thin<=s.settings.thinCarts);}
 assert.equal(JSON.stringify({s,rows}),before);assert.equal(removed.size,r.reserved.length);
});
test('general stock that supplies a critical build has a traced forming start even without a priority label',()=>{
 const s=fresh(seed),r=plan(s),m=criticalMilestones(s,r);const o=r.orderResults.find(o=>o.week==='2026-W50'&&o.priority==='critical');assert.ok(!r.some(row=>row.criticalFor.includes(o.week)));assert.ok(m.get(o.id).formingStart);assert.ok(m.get(o.id).formingStart<dateStr(o.start));
});
test('opening cured stock can cover an order without inventing a new forming date',()=>{
 const s=small();s.initialLoads=[];s.settings.thickStart=800;s.settings.dailyCarts=0;const r=plan(s),m=criticalMilestones(s,r);for(const x of m.values()){assert.ok(x.complete);assert.equal(x.formingStart,null);assert.equal(x.formingFinish,null);assert.equal(x.startBy,null);assert.equal(x.finalCure,null);}
});
test('uncovered or partial orders do not claim a forming finish or a feasible start-by date',()=>{
 const s=small();s.settings.dailyCarts=0;s.initialLoads=[];const r=plan(s);for(const x of criticalMilestones(s,r).values()){assert.equal(x.complete,false);assert.equal(x.startBy,null);assert.equal(x.formingFinish,null);assert.equal(x.downstream,null);}
});
test('step milestones and start estimates export with stable ISO dates and no fabricated downstream times',()=>{
 const s=small(),r=plan(s),csv=milestoneCsv(s,r);assert.ok(csv.includes('Start_by_estimate'));assert.ok(csv.includes('Planned_forming_start'));assert.ok(csv.includes('lamination_finish'));assert.equal(csv.split('\n').length,4);
});
test('standard withdrawals leave the oldest reserved lots assigned to critical builds',()=>{
 const s=small();s.settings.thickStart=0;const ledger=supplyLedger(s),critical={id:'C',kind:'thick',priority:'critical',total:20,filled:0},standard={id:'S',kind:'thick',priority:'standard',total:20,filled:0};
 ledger.receive([{id:'old',kind:'thick',carts:1,date:'2026-11-01',cured:dateNum('2026-11-06')},{id:'new',kind:'thick',carts:1,date:'2026-11-02',cured:dateNum('2026-11-07')}]);
 ledger.allocate(standard,20,dateNum('2026-11-08'),[critical]);ledger.allocate(critical,20,dateNum('2026-11-09'),[critical]);
 assert.equal(standard.allocations[0].id,'new-0');assert.equal(critical.allocations[0].id,'old-0');
});
test('critical forming and oven finishes agree with its sustained fully-cured coverage',()=>{
 const s=fresh(seed),r=plan(s),m=criticalMilestones(s,r);
 for(const o of r.orderResults.filter(o=>o.priority==='critical')){const coverage=r.find(row=>row.criticalProgress.find(x=>x.id===o.id)?.ready===o.total);assert.equal(m.get(o.id).finalCure,coverage.date);}
});
test('default step times do not move standard orders or overwrite their calendar-day allowance',()=>{
 const s=small();s.parts[0].delivery['2026-W49'].priority='standard';const before=plan(s).orderResults.find(o=>o.week==='2026-W49');s.settings.stepHours=hours;const after=plan(s).orderResults.find(o=>o.week==='2026-W49');
 assert.equal(after.route.complete,false);assert.equal(after.needBy,before.needBy);assert.equal(after.lead,6);
});
