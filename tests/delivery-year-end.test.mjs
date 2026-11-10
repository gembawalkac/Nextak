import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {yearEndDate,yearEndOutlook} from '../dist/delivery-year-end.js';
import {fresh,plan} from '../dist/simple-model.js';
import {deliveryResults} from '../dist/delivery.js';
import {deliveryView,orderCsv} from '../dist/delivery-view.js';
const cutoff='2026-12-31',base={inPlan:true,due:'2026-12-20',target:'2026-12-20',partial:false,ready:'2026-12-22',projected:'2026-12-27',lateDays:7};
const outcome=(o,end=cutoff)=>yearEndOutlook({...base,...o},end,cutoff);
test('late deliveries on or before Dec 31 are separate from deliveries after year end',()=>{
 assert.equal(outcome({}).key,'lateByYearEnd');assert.equal(outcome({projected:cutoff}).key,'lateByYearEnd');assert.equal(outcome({projected:'2027-01-01'}).key,'notByYearEnd');assert.equal(yearEndDate('2027-02-01'),'2027-12-31');
});
test('Akro still unfilled at year end is not treated as a late but completed order',()=>{
 const result=outcome({ready:null,projected:null,lateDays:null});assert.equal(result.key,'notByYearEnd');assert.equal(result.tone,'red');
 assert.equal(outcome({ready:'2027-01-01',projected:null,lateDays:null}).key,'notByYearEnd');
});
test('a short horizon cannot claim an unfinished order will miss year end',()=>{
 const result=outcome({ready:null,projected:null,lateDays:null},'2026-12-27');assert.equal(result.key,'yearEndUnknown');assert.ok(result.reason.includes('2026-12-31'));
 // A known January delivery is still classified even with a shorter horizon.
 assert.equal(outcome({projected:'2027-01-01'},'2026-12-27').key,'notByYearEnd');
});
test('Akro ready alone cannot imply delivery before year end when lead times are missing',()=>{
 const result=outcome({projected:null,lateDays:null});assert.equal(result.key,'yearEndUnknown');assert.ok(result.reason.includes('lead times'));
});
test('on-time and accepted-date deliveries are not counted as late completed work',()=>{
 assert.equal(outcome({lateDays:0}).key,'byYearEnd');assert.equal(outcome({accepted:'2026-12-29',target:'2026-12-29',lateDays:0}).key,'byYearEnd');
 assert.equal(outcome({due:'2027-01-03',projected:'2027-01-03'}).key,'laterYear');assert.equal(outcome({inPlan:false}).key,'outside');
});
test('partial plans cannot make a confident by-year-end promise',()=>{
 assert.equal(outcome({partial:true}).key,'yearEndUnknown');assert.equal(outcome({partial:true,projected:'2027-01-01'}).key,'notByYearEnd');
});
test('delivery filters, year-end status column and export use the same cutoff without changing the plan',()=>{
 const seed=JSON.parse(readFileSync(new URL('../dist/seed.json',import.meta.url))),s=fresh(seed);s.settings.start='2026-12-01';s.settings.end=cutoff;s.settings.dailyCarts=0;s.settings.thinStart=0;s.shutdowns=[];s.holidays=[];s.weeks=[{key:'2026-W51',date:'2026-12-14'}];s.parts=[{id:'unfilled',thickness:'thin',factor:1,qty:{'2026-W51':20},overrides:{},delivery:{'2026-W51':{leadDays:0}}}];const before=JSON.stringify(s),r=plan(s),o=deliveryResults(r)[0];assert.equal(yearEndOutlook(o,cutoff,cutoff).key,'notByYearEnd');const unfinished=deliveryView(s,r,'notByYearEnd',''),finished=deliveryView(s,r,'lateByYearEnd','');assert.ok(unfinished.includes('Edit unfilled'));assert.ok(unfinished.includes('Year-end outlook'));assert.ok(unfinished.includes('Not completed by Dec. 31'));assert.ok(!finished.includes('Edit unfilled'));assert.ok(orderCsv(r).includes('Year_end_outlook'));assert.ok(orderCsv(r).includes('Not completed by Dec. 31'));assert.equal(JSON.stringify(s),before);
});
