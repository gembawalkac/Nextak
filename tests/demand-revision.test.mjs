import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyDemandRevision,markDemandRevision} from '../dist/demand-revision.js';
import {fresh,plan,sheets} from '../dist/simple-model.js';
import {sheets as rawSheets} from '../dist/model.js';

const seed=JSON.parse(readFileSync(new URL('../dist/seed.json',import.meta.url)));
const part=(s,id)=>s.parts.find(p=>p.id===id);

test('November 9 demand aligns 18 supplied weeks and the week 47 sheet override column',()=>{
 const s=fresh(seed),r=seed.demandRevision;
 assert.equal(r.id,'demand-2026-11-09');
 assert.deepEqual(r.weeks,['2026-W46','2026-W47','2026-W48','2026-W49','2026-W50','2026-W51','2027-W02','2027-W03','2027-W04','2027-W05','2027-W06','2027-W07','2027-W09','2027-W10','2027-W13','2027-W17','2027-W21','2027-W26']);
 const totals=r.weeks.map(w=>r.products.reduce((n,id)=>n+(part(s,id).qty[w]||0),0));
 assert.deepEqual(totals,[106,34,2,170,223,259,111,76,54,21,65,29,7,2,5,5,64,20]);
 assert.ok(Math.abs(r.products.reduce((n,id)=>n+rawSheets(part(s,id),'2026-W47'),0)-64.45)<1e-9);
 for(const [id,n] of [['AMC-HM-LI-25X17X14',3.9],['AMC-HM-LI-34X3X3X2',10.8],['AMC-HM-LI-40X18X14',1.75],['AT-OXB-787-LPSUX',48]])assert.equal(part(s,id).overrides['2026-W47'],n);
 const t=part(s,'AT-OXB-11-T'),x=part(s,'AT-OXB-787-X04');
 assert.equal(t.qty['2026-W48'],undefined);assert.equal(t.qty['2026-W49'],13);
 assert.equal(x.qty['2026-W49'],undefined);assert.equal(x.qty['2026-W50'],17);assert.equal(x.qty['2027-W06'],7);
 assert.equal(part(s,'AT-OXB-76').qty['2027-W07'],5);
 const panels=r.weeks.map(w=>['thin','thick'].map(k=>s.parts.filter(p=>p.thickness===k).reduce((n,p)=>n+sheets(p,w),0)));
 assert.deepEqual(panels,[[75,48],[17,48],[2,0],[90,427],[91,447],[280,313],[106,11],[47,78],[39,77],[36,0],[52,157],[10,105],[22,0],[2,0],[20,0],[20,0],[68,0],[60,0]]);
 const orders=plan(s).orderResults;
 assert.equal(orders.find(o=>o.part==='AT-OXB-11'&&o.week==='2026-W46').total,71);
 assert.equal(orders.find(o=>o.part==='AT-OXB-787-X04'&&o.week==='2026-W50').total,47);
});

test('a previous saved plan receives new demand once while retaining manual plans, timing, priorities and other inputs',()=>{
 const s=fresh(seed),p=part(s,'AT-OXB-11');s.updates=['demand-2026-11-04'];p.qty['2026-W46']=100;p.overrides['2026-W46']=80;p.qty['2026-W47']=4;p.overrides['2026-W47']=3.2;p.overrides['2027-W21']=50;p.overrides['2027-W27']=77;p.stepRates={waterjet:5};p.delivery={'2026-W46':{priority:'critical',leadDays:4}};
 const t=part(s,'AT-OXB-11-T');t.qty['2026-W48']=18;delete t.qty['2026-W49'];
 s.settings.end='2027-01-31';s.settings.thinStart=40;
 s.manualLoads={'2026-11-09':{thin:0,thick:2}};
 s.initialLoads=[{kind:'thick',carts:3,date:'2026-10-30'}];
 s.parts.push({id:'CUSTOM',thickness:'thin',factor:1,qty:{'2026-W46':7},overrides:{}});
 part(s,'AT-OXB-4X8').qty['2026-W46']=9;
 s.weeks=s.weeks.filter(w=>w.key!=='2027-W07');
 const retained=structuredClone({settings:s.settings,delivery:p.delivery,stepRates:p.stepRates,custom:part(s,'CUSTOM'),manual:s.manualLoads,initial:s.initialLoads,holidays:s.holidays,shutdowns:s.shutdowns});
 applyDemandRevision(s,seed);
 assert.equal(p.qty['2026-W46'],88);assert.equal(p.overrides['2026-W46'],undefined);assert.equal(sheets(p,'2026-W47'),0);assert.equal(p.overrides['2027-W21'],undefined);assert.equal(p.qty['2027-W21'],59);assert.equal(p.overrides['2027-W27'],77);
 assert.equal(t.qty['2026-W48'],undefined);assert.equal(t.qty['2026-W49'],13);
 assert.equal(part(s,'AT-OXB-4X8').qty['2026-W46'],9);
 assert.ok(s.weeks.some(w=>w.key==='2027-W07'&&w.date==='2027-02-15'));
 assert.deepEqual({settings:s.settings,delivery:p.delivery,stepRates:p.stepRates,custom:part(s,'CUSTOM'),manual:s.manualLoads,initial:s.initialLoads,holidays:s.holidays,shutdowns:s.shutdowns},retained);
 assert.equal(p.qty['2026-W45'],18);
 p.qty['2026-W46']=90;applyDemandRevision(s,seed);assert.equal(p.qty['2026-W46'],90);
 const rows=plan(s);assert.deepEqual(rows.find(r=>r.date==='2026-11-09').load,{thin:0,thick:2});
});

test('restoring a backup keeps its demand through the next reload',()=>{
 const s=fresh(seed),p=part(s,'AT-OXB-11');p.qty['2026-W46']=70;
 markDemandRevision(s,seed);applyDemandRevision(s,seed);assert.equal(p.qty['2026-W46'],70);
});
