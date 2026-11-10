import {criticalSnapshot} from './critical-progress.js';
import {supplyLedger} from './build-milestones.js';
import {buildRoute,validateStepHours,SHIFT_HOURS} from './downstream.js';
import {sheets as rawSheets,dateNum,dateStr,kinds} from './model.js';
import {createWaterjetPull,requiredBatchReleases,TRANSFER_SHEETS} from './batch-flow.js';
const round=p=>Math.max(0,Math.ceil(p-1e-9));
export function applyDeliveryUpdate(s){
 s.updates??=[];
 const key='lpsux-critical-weeks-50-51';
 if(!s.updates.includes(key)){
  for(const p of s.parts)if(/^AT-OXB-787-LPSUX4?$/i.test(p.id))for(const w of ['2026-W50','2026-W51'])if(round(rawSheets(p,w))>0){p.delivery??={};p.delivery[w]??={};p.delivery[w].priority??='critical';}
  s.updates.push(key);
 }
 return s;
}
export function validateDelivery(s){
 validateStepHours(s.settings.stepHours);
 for(const p of s.parts){validateStepHours(p.stepHours);validateStepHours(p.stepRates);}
 const lead=s.settings.deliveryLeadDays;
 if(lead!=null&&(!Number.isInteger(lead)||lead<0||lead>365))throw Error('Remaining lead time must be a whole number from 0 to 365 days, or blank.');
 for(const p of s.parts)for(const [key,m] of Object.entries(p.delivery||{})){
  if(!m||typeof m!=='object'||Array.isArray(m))throw Error('Invalid order delivery settings.');
  validateStepHours(m.stepHours);
  if(m.priority!=null&&!['standard','critical'].includes(m.priority))throw Error('Choose Standard or Critical priority.');
  for(const k of ['due','accepted'])if(m[k]&&!Number.isFinite(dateNum(m[k])))throw Error('Enter a valid order date.');
  const w=s.weeks.find(w=>w.key===key),due=m.due||(w&&dateStr(dateNum(w.date)+6));
  if(m.accepted&&due&&m.accepted<due)throw Error('An agreed later date must be on or after the original due date.');
  if(m.leadDays!=null&&(!Number.isInteger(m.leadDays)||m.leadDays<0||m.leadDays>365))throw Error('Remaining lead time must be a whole number from 0 to 365 days, or blank.');
 }
}
export function createOrders(s){
 const orders=[];
 for(const w of s.weeks)for(const [partIndex,p]of s.parts.entries()){
  const total=round(rawSheets(p,w.key));if(!total)continue;
  const m=p.delivery?.[w.key]||{},due=m.due||dateStr(dateNum(w.date)+6),target=m.accepted||due,route=buildRoute(s,p,w.key),lead=route.complete?route.total/10:m.leadDays??s.settings.deliveryLeadDays??null,batchDue=requiredBatchReleases(s,target,route,total),needBy=route.complete?dateNum(batchDue.at(-1).date):dateNum(target)-(lead??0),start=route.complete?dateNum(batchDue[0].date):needBy-6;
  orders.push({id:JSON.stringify([p.id,w.key]),part:p.id,partIndex,week:w.key,kind:p.thickness,cases:p.qty[w.key]||0,total,priority:m.priority||'standard',due,target,accepted:m.accepted||'',lead,route,needBy,start,batchDue,transfers:[],filled:0,released:0,ready:null,byDue:0,allocations:[],partial:start<dateNum(s.settings.start),inPlan:dateNum(target)>=dateNum(s.settings.start)&&start<=dateNum(s.settings.end)});
 }
 return orders.sort((a,b)=>(a.priority==='critical'?0:1)-(b.priority==='critical'?0:1)||a.needBy-b.needBy||a.part.localeCompare(b.part));
}
export function createOrderEngine(s){
 const orders=createOrders(s),active=orders.filter(o=>o.inPlan),dm=new Map(),ledger=supplyLedger(s),intake=createWaterjetPull(s),first=dateNum(s.settings.start);
 for(const o of active){
  const releases=o.route.complete?o.batchDue:Array.from({length:7},(_,j)=>({date:dateStr(o.start+j),sheets:Math.ceil(o.total*(j+1)/7)-Math.ceil(o.total*j/7)}));
  for(const release of releases){const day=Math.max(first,dateNum(release.date)),d=dm.get(day)||{thin:0,thick:0};d[o.kind]+=release.sheets;dm.set(day,d);}
 }
 function protectedOrders(day){return active.filter(o=>o.priority==='critical'&&o.filled<o.total&&o.needBy<=day+28)}
 function step(day,inv,closed){
  const used={thin:0,thick:0},backlog={thin:0,thick:0},reserved={thin:0,thick:0};
  for(const o of active)o.released=o.route.complete?o.batchDue.filter(b=>dateNum(b.date)<=day).reduce((n,b)=>n+b.sheets,0):Math.ceil(o.total*Math.min(7,Math.max(0,day-o.start+1))/7);
  const legacyServed=new Set();
  while(!closed){
   const protectedNow=protectedOrders(day),held={thin:0,thick:0};
   for(const o of protectedNow)held[o.kind]+=o.total-o.filled;
   let next=null;
   for(const o of active){
    if(o.filled===o.total||legacyServed.has(o))continue;
    const available=inv[o.kind]-(o.priority==='critical'?0:held[o.kind]);
    let take,at;
    if(o.route.complete){
     if(day<o.start&&!(o.priority==='critical'&&o.needBy<=day+28))continue;
     take=Math.min(TRANSFER_SHEETS,o.total-o.filled);
     if(available<take)continue;
     at=intake.next(o,take,day);
     if(at==null)continue;
    }else{
     take=Math.min(o.released-o.filled,available);
     if(take<=0)continue;
     at=day*SHIFT_HOURS;
    }
    if(!next||at<next.at)next={o,take,at};
   }
   if(!next)break;
   const {o,take,at}=next;
   if(o.route.complete)o.transfers.push(intake.pull(o,take,at));
   else legacyServed.add(o);
   ledger.allocate(o,take,day,protectedNow);
   o.filled+=take;inv[o.kind]-=take;used[o.kind]+=take;
   if(o.filled===o.total&&!o.ready)o.ready=dateStr(day);
  }
  for(const o of active){backlog[o.kind]+=Math.max(0,o.released-o.filled);if(day===o.needBy)o.byDue=o.filled;}
  for(const k of kinds)reserved[k]=Math.min(inv[k],protectedOrders(day).filter(o=>o.kind===k).reduce((n,o)=>n+o.total-o.filled,0));
  return {used,backlog,reserved};
 }
 function chooseCritical(day,candidates,inv,loads,load){
  // Protect near-term critical groups first; uncommitted supply is not counted twice.
  const available={};for(const k of kinds)available[k]=inv[k]+load[k]*20+loads.filter(x=>!x.done&&!x.conflict&&x.kind===k).reduce((n,x)=>n+x.carts*20,0);
  for(const o of protectedOrders(day)){
   const remaining=o.total-o.filled;
   if(available[o.kind]>=remaining){available[o.kind]-=remaining;continue;}
   if(candidates.includes(o.kind))return {kind:o.kind,label:`${o.part} · ${o.week}`};
   available[o.kind]=0;
  }
  return null;
 }
 return {orders,dm,step,chooseCritical,receive:ledger.receive,snapshot:(day,inv,loads)=>criticalSnapshot(orders,day,inv,loads)};
}
export function deliveryResults(rows){return (rows.orderResults||[]).map(o=>{
 const projected=o.ready&&o.lead!=null?(o.route?.complete?o.downstreamFinish:dateStr(dateNum(o.ready)+o.lead)):null;
 const lateDays=projected?Math.max(0,dateNum(projected)-dateNum(o.target)):null;
 let label,tone;
 if(!o.inPlan){label='Outside plan';tone='neutral';}
 else if(o.partial){label='Partial horizon';tone='amber';}
 else if(!o.ready){label=o.needBy<=dateNum(rows.at(-1).date)?'Late · not covered':'Beyond horizon';tone=o.needBy<=dateNum(rows.at(-1).date)?'red':'amber';}
 else if(o.lead==null&&dateNum(o.ready)>dateNum(o.target)){label=`Late · at least ${dateNum(o.ready)-dateNum(o.target)}d`;tone='red';}
 else if(o.lead==null){label='Add remaining lead time';tone='amber';}
 else if(lateDays>0){label=`Late · ${lateDays}d`;tone='red';}
 else {label=o.accepted?'Within agreed date':'On time';tone=o.accepted?'amber':'green';}
 return {...o,projected,lateDays,label,tone,originalLateDays:o.ready?Math.max(0,dateNum(projected||o.ready)-dateNum(o.due)):null,remaining:o.total-o.filled};
 });}
