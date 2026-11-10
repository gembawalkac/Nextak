import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fresh,plan,validate} from '../dist/simple-model.js';
import {buildRoute,BUILD_STEPS} from '../dist/downstream.js';
import {createOrders,deliveryResults} from '../dist/delivery.js';
import {productBatchHours,productLeadTimesView} from '../dist/product-lead-times.js';
const seed=JSON.parse(readFileSync(new URL('../dist/seed.json',import.meta.url)));
const hours={lamination:5,waterjet:5,staging:20,assembly:10,qc:10,shipping:10};
function state(){const s=fresh(seed);s.parts=[{id:'Product A',thickness:'thick',factor:4,qty:{'2026-W50':60,'2026-W51':78},overrides:{},delivery:{'2026-W50':{priority:'critical',leadDays:6},'2026-W51':{priority:'standard',leadDays:8}}},{id:'Product B',thickness:'thin',factor:1,qty:{'2026-W50':20},overrides:{},delivery:{'2026-W50':{priority:'critical',leadDays:3}}}];return s;}
test('legacy whole-order product allowances retain their original meaning across quantities and priorities',()=>{
 const s=state();s.parts[0].stepHours=hours;const orders=createOrders(s),a=orders.filter(o=>o.part==='Product A');assert.equal(a.length,2);for(const o of a){assert.ok(o.route.complete);assert.equal(o.route.total,50);assert.equal(o.lead,5);}assert.equal(a.find(o=>o.week==='2026-W50').total,240);assert.equal(a.find(o=>o.week==='2026-W51').total,312);
 const b=orders.find(o=>o.part==='Product B');assert.equal(b.route.complete,false);assert.equal(b.lead,3);
});
test('an order override wins over its product; product values win over legacy critical defaults; zero bypasses',()=>{
 const s=state(),p=s.parts[0];s.settings.stepHours={...hours,assembly:100};p.stepHours={...hours,assembly:20,waterjet:0};p.delivery['2026-W50'].stepHours={assembly:1};
 const a=buildRoute(s,p,'2026-W50'),b=buildRoute(s,p,'2026-W51');assert.equal(a.hours.assembly,1);assert.equal(a.hours.waterjet,0);assert.equal(b.hours.assembly,20);assert.equal(b.hours.waterjet,0);
});
test('blank product fields preserve legacy defaults for critical groups and existing total allowances elsewhere',()=>{
 const s=state(),p=s.parts[0];s.settings.stepHours=hours;p.stepHours={lamination:10,assembly:null};const c=buildRoute(s,p,'2026-W50'),standard=buildRoute(s,p,'2026-W51');assert.ok(c.complete);assert.equal(c.hours.lamination,10);assert.equal(c.hours.assembly,10);assert.equal(standard.complete,false);assert.equal(standard.hours.assembly,null);
 const o=createOrders(s).find(o=>o.part===p.id&&o.week==='2026-W51');assert.equal(o.lead,8);
});
test('batch entry preserves entered hours and zero, with no lamination prefill',()=>{
 const a=productBatchHours({lamination:'2',waterjet:'0',staging:'2',assembly:'0.1',qc:'',shipping:'1.25'});assert.deepEqual(a,{lamination:2,waterjet:0,staging:2,assembly:0.1,qc:null});assert.equal(productBatchHours({}).lamination,null);
 for(const value of [-1,3650.1,'bad'])assert.throws(()=>productBatchHours({qc:value}),/Step times/);
});
test('invalid product times are validated through old schema-2 backups',()=>{
 for(const value of [{qc:-1},{qc:NaN},{qc:Infinity},[],4]){const s=state();s.parts[0].stepHours=value;assert.throws(()=>validate(s),/Step times|step times/);}assert.equal(validate(state()).version,2);
});
test('old plans with no product times keep the same forecasts and backup round trips preserve product times',()=>{
 const s=state(),before=JSON.stringify(s),baseline=plan(s);assert.equal(JSON.stringify(s),before);for(const p of s.parts)p.stepHours=Object.fromEntries(BUILD_STEPS.map(([key])=>[key,null]));const unchanged=plan(s);assert.deepEqual(unchanged.map(r=>[r.date,r.load,r.inv]),baseline.map(r=>[r.date,r.load,r.inv]));
 s.parts[0].stepHours=hours;const backup=JSON.parse(JSON.stringify(s)),snapshot=JSON.stringify(backup),r=plan(validate(backup));assert.equal(JSON.stringify(backup),snapshot);assert.deepEqual(backup.parts[0].stepHours,hours);const o=deliveryResults(r).find(o=>o.part==='Product A'&&o.week==='2026-W50');assert.ok(o.projected);assert.ok(o.route.complete);
});
test('product entry table distinguishes sheet and case batches and has an explicit save action',()=>{
 const s=state(),html=productLeadTimesView(s);assert.ok(html.includes('Lead times by product type'));assert.ok(html.includes('Hours / 20 sheets'));assert.ok(html.includes('Save product lead times'));for(const p of s.parts)for(const [,label] of BUILD_STEPS)assert.ok(html.includes(`${p.id} ${label} hours per 20 ${label==='Lamination'?'sheets':'cases'}`));assert.ok(productLeadTimesView(s,true).includes('have recalculated'));
});
test('unsaved lamination fields are blank and OXB-787 shows a disabled zero even with a saved prefill',()=>{
 const s=state();s.parts[0].id='AT-OXB-787-LPSUX';s.parts[0].stepRates={lamination:2};const html=productLeadTimesView(s);assert.match(html,/data-productlead="0" data-step="lamination"[^>]*value="0" disabled/);assert.match(html,/data-productlead="1" data-step="lamination"[^>]*value=""/);assert.ok(html.includes('Not required'));assert.deepEqual(productBatchHours({}),Object.fromEntries(BUILD_STEPS.map(([key])=>[key,null])));
});
test('all OXB-787 products bypass saved batch, legacy and order lamination times without altering other steps',()=>{
 const s=state(),p=s.parts[0];p.stepRates={lamination:2,waterjet:3,staging:1,assembly:2,qc:1,shipping:2};p.stepHours={lamination:40};p.delivery['2026-W50'].stepHours={lamination:100};s.settings.stepHours={lamination:50};
 for(const id of ['AT-OXB-787-LPSUX','AT-OXB-787-LPSUX4','AT-OXB-787-X04','AT-OXB-787-X12']){p.id=id;const r=buildRoute(s,p,'2026-W50');assert.equal(r.hours.lamination,0);assert.equal(r.hours.waterjet,9);assert.ok(r.complete);assert.equal(r.total,21);}
 assert.equal(p.stepRates.lamination,2);assert.equal(p.delivery['2026-W50'].stepHours.lamination,100);p.id='AT-OXB-11';assert.equal(buildRoute(s,p,'2026-W50').hours.lamination,100);
});
