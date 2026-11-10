import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BUILD_STEPS,buildRoute} from '../dist/downstream.js';
import {sheetBatches,scheduleBatchFlow,requiredBatchReleases} from '../dist/batch-flow.js';
import {fresh,plan,dateNum} from '../dist/simple-model.js';
import {deliveryResults} from '../dist/delivery.js';
import {criticalMilestones} from '../dist/build-milestones.js';
import {buildTimeline} from '../dist/milestone-view.js';
const s={holidays:[],shutdowns:[]};
const route=(waterjet=30,assembly=30)=>({complete:true,total:waterjet+assembly,hours:Object.fromEntries(BUILD_STEPS.map(([key])=>[key,key==='waterjet'?waterjet:key==='assembly'?assembly:0]))});
function order(extra={}){return {id:'A',total:60,filled:60,priority:'critical',needBy:dateNum('2026-11-08'),inPlan:true,ready:'2026-11-04',route:route(),transfers:[{date:'2026-11-02',sheets:20},{date:'2026-11-03',sheets:20},{date:'2026-11-04',sheets:20}],...extra};}
test('20-sheet batches start before final withdrawal and different steps overlap',()=>{
 const o=order(),r=scheduleBatchFlow(s,[o]).get(o.id);assert.equal(r.finish,'2026-11-05');assert.equal(r.steps.find(x=>x.key==='waterjet').start,'2026-11-02');assert.equal(r.steps.find(x=>x.key==='assembly').start,'2026-11-03');assert.equal(r.batches[1].steps.find(x=>x.key==='waterjet').start,'2026-11-03');assert.ok(r.steps.find(x=>x.key==='assembly').start<o.ready);
});
test('a busy step queues batches across orders without overlapping its capacity',()=>{
 const a=order({id:'standard',priority:'standard',transfers:Array.from({length:3},()=>({date:'2026-11-02',sheets:20}))}),b=order({id:'critical',transfers:Array.from({length:3},()=>({date:'2026-11-02',sheets:20}))});
 const flow=scheduleBatchFlow(s,[a,b]);assert.equal(flow.get(b.id).steps.find(x=>x.key==='waterjet').start,'2026-11-02');assert.equal(flow.get(a.id).steps.find(x=>x.key==='waterjet').start,'2026-11-05');
 for(const [key] of BUILD_STEPS){const runs=[...flow.values()].flatMap(r=>r.batches.flatMap(b=>b.steps.filter(x=>x.key===key&&!x.skipped))).sort((a,b)=>a.startTime-b.startTime);for(let i=1;i<runs.length;i++)assert.ok(runs[i].startTime>=runs[i-1].finishTime-1e-7);}
});
test('holidays pause every stage and a waterjet shutdown pauses only waterjet',()=>{
 const state={holidays:[{start:'2026-11-03',end:'2026-11-03'}],shutdowns:[{start:'2026-11-02',end:'2026-11-02'}]},o=order(),r=scheduleBatchFlow(state,[o]).get(o.id);assert.equal(r.steps.find(x=>x.key==='waterjet').start,'2026-11-04');assert.equal(r.finish,'2026-11-07');for(const b of r.batches)for(const x of b.steps.filter(x=>!x.skipped)){assert.notEqual(x.start,'2026-11-03');assert.notEqual(x.finish,'2026-11-03');}
});
test('partial final batches preserve whole sheets and total sheet- and case-based workload',()=>{
 assert.deepEqual(sheetBatches(45),[20,20,5]);const state={...s,settings:{},parts:[]},p={id:'AT-OXB-787-X04',qty:{w:9},factor:5,overrides:{},stepRates:{lamination:2,waterjet:2,staging:0,assembly:4,qc:0,shipping:0}},r=buildRoute(state,p,'w'),o=order({total:45,filled:45,route:r,transfers:sheetBatches(45).map(sheets=>({date:'2026-11-02',sheets}))}),flow=scheduleBatchFlow(s,[o]).get(o.id);
 for(const [key] of BUILD_STEPS)assert.ok(Math.abs(flow.batches.reduce((n,b)=>n+b.steps.find(x=>x.key===key).hours,0)-r.hours[key])<1e-7);assert.equal(r.hours.lamination,0);assert.equal(flow.batches.reduce((n,b)=>n+b.sheets,0),45);assert.equal(flow.finish,'2026-11-02');
});
test('available batches can progress without inventing a whole-order completion',()=>{
 const o=order({ready:null,filled:20,transfers:[{date:'2026-11-02',sheets:20}]}),r=scheduleBatchFlow(s,[o]).get(o.id);assert.equal(r.finish,null);assert.equal(r.complete,false);assert.equal(r.expectedBatches,3);assert.equal(r.steps.find(x=>x.key==='waterjet').start,'2026-11-02');assert.equal(r.steps.find(x=>x.key==='waterjet').finish,null);assert.equal(r.batches[0].steps.at(-1).finish,'2026-11-03');
});
test('backward batch dates permit an on-time forward flow through closures',()=>{
 const state={holidays:[{start:'2026-11-05',end:'2026-11-05'}],shutdowns:[]};
 for(const total of [20,45,60,312]){const r=route(30,20),due=requiredBatchReleases(state,'2026-11-10',r,total),o=order({total,filled:total,route:r,ready:due.at(-1).date,transfers:due});const f=scheduleBatchFlow(state,[o]).get(o.id);assert.ok(f.finish<='2026-11-10',JSON.stringify({total,due,finish:f.finish}));assert.equal(due.reduce((n,b)=>n+b.sheets,0),total);assert.ok(due.every(b=>b.date!=='2026-11-05'));}
});
test('integrated planner withdraws full batches, debits stock once and uses the final batch QC finish',()=>{
 const seed=JSON.parse(readFileSync(new URL('../dist/seed.json',import.meta.url))),state=fresh(seed);state.settings.start='2026-11-01';state.settings.end='2026-11-20';state.settings.thinStart=45;state.settings.thickStart=0;state.settings.dailyCarts=0;state.shutdowns=[];state.holidays=[];state.weeks=[{key:'2026-W45',date:'2026-11-02'}];state.parts=[{id:'A',thickness:'thin',factor:1,qty:{'2026-W45':45},overrides:{},stepRates:{lamination:0,waterjet:10,staging:0,assembly:10,qc:0,shipping:0},delivery:{'2026-W45':{priority:'critical'}}}];const before=JSON.stringify(state),rows=plan(state),o=rows.orderResults[0],m=criticalMilestones(state,rows).get(o.id);
 assert.deepEqual(o.transfers.map(b=>b.sheets),[20,20,5]);assert.equal(rows.reduce((n,r)=>n+r.used.thin,0),45);assert.equal(rows.at(-1).inv.thin,0);assert.equal(deliveryResults(rows)[0].projected,o.batchFlow.batches.at(-1).steps.at(-1).finish);assert.equal(m.downstream.finish,o.downstreamFinish);assert.ok(buildTimeline(state,o,m).includes('20-sheet batch forecast'));assert.equal(JSON.stringify(state),before);for(const r of rows)assert.equal(r.inv.thin,r.opening.thin+r.out.thin-r.used.thin);
});
test('insufficient stock waits for a complete batch and the order remainder never disappears',()=>{
 const seed=JSON.parse(readFileSync(new URL('../dist/seed.json',import.meta.url))),state=fresh(seed);state.settings.start='2026-11-01';state.settings.end='2026-11-20';state.settings.thickStart=19;state.settings.dailyCarts=0;state.shutdowns=[];state.holidays=[];state.weeks=[{key:'2026-W45',date:'2026-11-02'}];state.parts=[{id:'AT-OXB-787-X04',thickness:'thick',factor:5,qty:{'2026-W45':9},overrides:{},stepRates:{waterjet:2,staging:0,assembly:2,qc:0,shipping:0},delivery:{}}];const rows=plan(state),o=rows.orderResults[0];assert.equal(o.filled,0);assert.equal(rows.at(-1).inv.thick,19);assert.equal(o.downstreamFinish,null);assert.equal(o.batchFlow.batches.length,0);assert.equal(deliveryResults(rows)[0].remaining,45);
});
test('critical batches start as cured stock arrives within the priority window, before final supply exists',()=>{
 const seed=JSON.parse(readFileSync(new URL('../dist/seed.json',import.meta.url))),state=fresh(seed);state.settings.start='2026-11-02';state.settings.end='2026-11-20';state.settings.thickStart=20;state.settings.dailyCarts=0;state.shutdowns=[];state.holidays=[];state.initialLoads=[{kind:'thick',carts:2,date:'2026-11-01'}];state.weeks=[{key:'2026-W46',date:'2026-11-09'}];state.parts=[{id:'AT-OXB-787-X04',thickness:'thick',factor:5,qty:{'2026-W46':12},overrides:{},stepRates:{waterjet:10,staging:0,assembly:10,qc:0,shipping:0},delivery:{'2026-W46':{priority:'critical'}}}];const rows=plan(state),o=rows.orderResults[0];assert.equal(o.transfers[0].date,'2026-11-02');assert.equal(o.ready,'2026-11-06');assert.equal(o.batchFlow.steps.find(x=>x.key==='waterjet').start,'2026-11-02');assert.equal(o.batchFlow.batches[0].steps.at(-1).finish,'2026-11-02');assert.ok(o.batchFlow.finish>=o.ready);assert.equal(rows.reduce((n,r)=>n+r.used.thick,0),60);
});
test('a mixed-product plan conserves every sheet and shares downstream lanes without changing saved inputs',()=>{
 const seed=JSON.parse(readFileSync(new URL('../dist/seed.json',import.meta.url))),state=fresh(seed);for(const p of state.parts)p.stepRates={lamination:2,waterjet:2,staging:10,assembly:5,qc:2,shipping:2};const before=JSON.stringify(state),rows=plan(state);
 for(const r of rows){assert.ok(r.oven.thin+r.oven.thick<=10);for(const kind of ['thin','thick']){assert.equal(r.inv[kind],r.opening[kind]+r.out[kind]-r.excluded[kind]-r.used[kind]);assert.ok(r.inv[kind]>=0);}}
 for(const o of rows.orderResults.filter(o=>o.inPlan&&o.route.complete)){assert.equal(o.transfers.reduce((n,b)=>n+b.sheets,0),o.filled);assert.ok(o.transfers.every(b=>Number.isInteger(b.sheets)&&b.sheets>0&&b.sheets<=20));assert.equal(o.batchFlow.complete,!!o.ready);if(o.ready)assert.ok(o.batchFlow.finish>=o.ready);}
 for(const [key] of BUILD_STEPS){const operations=rows.orderResults.flatMap(o=>o.batchFlow?.batches.flatMap(b=>b.steps.filter(x=>x.key===key&&!x.skipped))||[]).sort((a,b)=>a.startTime-b.startTime);for(let i=1;i<operations.length;i++)assert.ok(operations[i].startTime>=operations[i-1].finishTime-1e-7);}
 assert.equal(JSON.stringify(state),before);
});
function pullPlan({waterjet=10,lamination=0,shutdowns=[],twoOrders=false}={}){
 const seed=JSON.parse(readFileSync(new URL('../dist/seed.json',import.meta.url))),state=fresh(seed),week='2026-W46';
 Object.assign(state.settings,{start:'2026-11-02',end:'2026-11-20',thinStart:twoOrders?20:60,thickStart:twoOrders?40:0,dailyCarts:0});
 state.holidays=[];state.shutdowns=shutdowns;state.weeks=[{key:week,date:'2026-11-09'}];
 const part=(id,thickness,qty)=>({id,thickness,factor:1,qty:{[week]:qty},overrides:{},stepRates:{lamination,waterjet,staging:0,assembly:2,qc:0,shipping:2},delivery:{[week]:{priority:'critical'}}});
 state.parts=twoOrders?[part('A','thin',20),part('B','thick',40)]:[part('A','thin',60)];
 return plan(state);
}
test('waterjet pulls only the current batch and the remainder stays in closing inventory',()=>{
 const rows=pullPlan({waterjet:15}),o=rows.orderResults[0];
 assert.deepEqual(rows.slice(0,4).map(r=>[r.used.thin,r.inv.thin]),[[20,40],[20,20],[0,20],[20,0]]);
 assert.deepEqual(o.transfers.map(b=>b.date),['2026-11-02','2026-11-03','2026-11-05']);
 for(let i=1;i<o.transfers.length;i++)assert.equal(o.transfers[i].steps[1].startTime,o.transfers[i-1].steps[1].finishTime);
 assert.equal(deliveryResults(rows)[0].projected,o.batchFlow.batches.at(-1).steps.at(-1).finish);
});
test('multiple pulls in a shift share one waterjet across thicknesses and leave stock during shutdown',()=>{
 const rows=pullPlan({waterjet:4,twoOrders:true,shutdowns:[{start:'2026-11-03',end:'2026-11-03'}]});
 assert.deepEqual(rows.slice(0,3).map(r=>[r.used.thin,r.used.thick,r.inv.thick]),[[20,40,0],[0,0,0],[0,0,0]]);
 const batches=rows.orderResults.flatMap(o=>o.transfers).sort((a,b)=>a.steps[1].startTime-b.steps[1].startTime);
 assert.deepEqual(batches.map(b=>b.steps[1].startTime-dateNum('2026-11-02')*10),[0,4,8]);
 const held=pullPlan({waterjet:10,shutdowns:[{start:'2026-11-03',end:'2026-11-03'}]});
 assert.deepEqual(held.slice(0,4).map(r=>[r.used.thin,r.inv.thin]),[[20,40],[0,40],[20,20],[20,0]]);
});
test('lamination prepares only the batch the waterjet has requested',()=>{
 const rows=pullPlan({waterjet:8,lamination:4}),o=rows.orderResults[0];
 assert.deepEqual(rows.slice(0,3).map(r=>r.inv.thin),[40,20,0]);
 for(let i=1;i<o.transfers.length;i++)assert.equal(o.transfers[i].steps[0].startTime,o.transfers[i-1].steps[1].finishTime);
});

test('20 LPSUX cases become ready as one order after all four batches clear QC',()=>{
 const seed=JSON.parse(readFileSync(new URL('../dist/seed.json',import.meta.url))),state=fresh(seed),week='2026-W46';
 Object.assign(state.settings,{start:'2026-11-02',end:'2026-11-20',thickStart:80,dailyCarts:0});
 state.shutdowns=[];state.holidays=[];state.weeks=[{key:week,date:'2026-11-09'}];
 const p={id:'AT-OXB-787-LPSUX',thickness:'thick',factor:4,qty:{[week]:20},overrides:{},stepRates:{waterjet:7,staging:2,assembly:20,qc:5,shipping:1},delivery:{[week]:{priority:'critical'}}};state.parts=[p];
 const rows=plan(state),o=deliveryResults(rows)[0],m=criticalMilestones(state,rows).get(o.id);
 assert.equal(o.route.total,34);assert.equal(o.batchFlow.batches.length,4);
 assert.equal(o.batchFlow.batches[0].steps.at(-1).finish,'2026-11-02');
 assert.equal(o.projected,'2026-11-04');assert.equal(o.projected,o.batchFlow.batches.at(-1).steps.at(-1).finish);
 assert.ok(o.batchFlow.batches.every(b=>b.steps.at(-1).key==='qc'));
 assert.ok(buildTimeline(state,o,m).includes('Whole order ready to ship'));
 assert.equal(p.stepRates.shipping,1);p.stepRates.shipping=100;
 assert.equal(deliveryResults(plan(state))[0].projected,o.projected);
});
