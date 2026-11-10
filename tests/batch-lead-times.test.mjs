import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fresh,plan,validate} from '../dist/simple-model.js';
import {buildRoute,BUILD_STEPS} from '../dist/downstream.js';
import {createOrders} from '../dist/delivery.js';
import {buildTimeline} from '../dist/milestone-view.js';
import {criticalMilestones} from '../dist/build-milestones.js';
const seed=JSON.parse(readFileSync(new URL('../dist/seed.json',import.meta.url)));
const rates={lamination:2,waterjet:3,staging:1,assembly:2,qc:1,shipping:2};
function state(){const s=fresh(seed);s.parts=[{id:'LPSUX',thickness:'thick',factor:4,qty:{'2026-W50':78,'2026-W51':60},overrides:{},stepRates:rates,delivery:{'2026-W50':{priority:'critical',leadDays:6},'2026-W51':{priority:'critical',leadDays:6}}}];return s;}
test('78 cases and 312 sheets scale lamination by sheets and all other stages by cases',()=>{
 const s=state(),route=buildRoute(s,s.parts[0],'2026-W50');assert.equal(route.hours.lamination,31.2);assert.equal(route.hours.waterjet,11.7);assert.equal(route.hours.staging,3.9);assert.equal(route.hours.assembly,7.8);assert.equal(route.hours.qc,3.9);assert.equal(route.hours.shipping,undefined);assert.equal(Number(route.total.toFixed(6)),58.5);assert.ok(route.complete);assert.equal(route.rateDetails.lamination.basis,'sheets');assert.equal(route.rateDetails.waterjet.basis,'cases');
 const smaller=buildRoute(s,s.parts[0],'2026-W51');assert.equal(smaller.hours.lamination,24);assert.equal(smaller.hours.waterjet,9);
});
test('partial batches scale proportionally and lamination uses the rounded whole-sheet requirement',()=>{
 const s=state(),p=s.parts[0];p.qty['2026-W50']=21;p.overrides['2026-W50']=84.1;const r=buildRoute(s,p,'2026-W50');assert.equal(r.hours.lamination,8.5);assert.equal(r.hours.waterjet,3.15);assert.equal(r.rateDetails.lamination.quantity,85);
});
test('sheet-only demand cannot silently become zero case-based processing time',()=>{
 const s=state(),p=s.parts[0];p.qty['2026-W50']=0;p.overrides['2026-W50']=312;const r=buildRoute(s,p,'2026-W50');assert.equal(r.hours.lamination,31.2);assert.equal(r.hours.waterjet,null);assert.equal(r.needsCases,true);assert.equal(r.complete,false);assert.equal(createOrders(s).find(o=>o.week==='2026-W50').lead,6);
 p.stepRates=Object.fromEntries(BUILD_STEPS.map(([key])=>[key,key==='lamination'?2:0]));assert.ok(buildRoute(s,p,'2026-W50').complete);assert.equal(buildRoute(s,p,'2026-W50').needsCases,false);
});
test('per-order overrides remain whole-order hours and product batch rates take priority over old allowances',()=>{
 const s=state(),p=s.parts[0];p.stepHours=Object.fromEntries(BUILD_STEPS.map(([key])=>[key,100]));s.settings.stepHours=p.stepHours;p.delivery['2026-W50'].stepHours={lamination:7,assembly:0};const r=buildRoute(s,p,'2026-W50');assert.equal(r.hours.lamination,7);assert.equal(r.hours.waterjet,11.7);assert.equal(r.hours.assembly,0);assert.equal(buildRoute(s,p,'2026-W50',{ignoreOrderOverrides:true}).hours.lamination,31.2);
});
test('blank batch rates preserve earlier whole-order allowances without reinterpreting old day inputs',()=>{
 const s=state(),p=s.parts[0];p.stepRates={lamination:2,waterjet:null};p.stepHours=Object.fromEntries(BUILD_STEPS.map(([key])=>[key,5]));const r=buildRoute(s,p,'2026-W50');assert.equal(r.hours.lamination,31.2);assert.equal(r.hours.waterjet,5);assert.ok(r.complete);assert.deepEqual(p.stepHours,Object.fromEntries(BUILD_STEPS.map(([key])=>[key,5])));
});
test('batch rates survive backups, validate without changing schema and never mutate the source plan',()=>{
 const s=state(),before=JSON.stringify(s),backup=JSON.parse(before);plan(validate(backup));assert.equal(JSON.stringify(s),before);assert.equal(JSON.stringify(backup),before);assert.equal(s.version,2);
 for(const invalid of [{lamination:-1},{waterjet:Infinity},[],7]){const copy=structuredClone(s);copy.parts[0].stepRates=invalid;assert.throws(()=>validate(copy),/Step times|step times/);}
});
test('critical milestone table exposes calculated total hours and the quantity basis',()=>{
 const s=state();s.settings.thickStart=1000;s.settings.dailyCarts=0;const rows=plan(s),o=rows.orderResults.find(o=>o.week==='2026-W50'),m=criticalMilestones(s,rows).get(o.id),html=buildTimeline(s,o,m);assert.ok(html.includes('31.2 working hours'));assert.ok(html.includes('2h / 20 sheets'));assert.ok(html.includes('11.7 working hours'));assert.ok(html.includes('3h / 20 cases'));
});
