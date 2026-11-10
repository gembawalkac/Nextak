import {dateNum,dateStr,weekKey,kinds} from './model.js';
import {canUnloadOn,MAX_OVEN_CARTS} from './oven.js';

// Follow physical FIFO lots, including general production that later supplies a critical order.
export function supplyLedger(s){
 const stock=Object.fromEntries(kinds.map(kind=>[kind,[{id:`stock-${kind}`,kind,remaining:Math.floor(s.settings[kind+'Start']),opening:true,loadDate:null,formedDate:null,curedDate:null}]]));
 function receive(events){for(const e of events){if(e.conflict)continue;for(let i=0;i<e.carts;i++)stock[e.kind].push({id:`${e.id}-${i}`,kind:e.kind,remaining:20,opening:!!e.initial,loadDate:e.date,formedDate:e.initial?null:e.date,curedDate:dateStr(e.cured)});}}
 function allocate(o,quantity,day,protectedOrders=[]){
  if(!quantity)return;
  o.allocations??=[];let remaining=quantity;
  // Reserve the oldest lots for critical groups in the same order as the
  // quantity reservations. Standard demand uses the oldest unreserved supply.
  const prior=o.priority==='critical'?protectedOrders.slice(0,protectedOrders.findIndex(x=>x.id===o.id)):protectedOrders;
  let skip=prior.filter(x=>x.kind===o.kind).reduce((n,x)=>n+x.total-x.filled,0);
  function consume(lot,limit){
   const take=Math.min(remaining,lot.remaining,limit);if(!take)return;
   let a=o.allocations.find(x=>x.id===lot.id);
   if(!a){const {remaining:unused,...source}=lot;a={...source,quantity:0,firstRelease:dateStr(day),lastRelease:dateStr(day)};o.allocations.push(a);}
   a.quantity+=take;a.lastRelease=dateStr(day);lot.remaining-=take;remaining-=take;
  }
  for(const lot of stock[o.kind]){const held=Math.min(skip,lot.remaining);skip-=held;consume(lot,lot.remaining-held);if(!remaining)break;}
  // If the quantity engine has already released overlapping critical demand,
  // trace its actual withdrawal without inventing or duplicating any sheets.
  if(remaining)for(const lot of stock[o.kind]){consume(lot,lot.remaining);if(!remaining)break;}
  if(remaining)o.allocations.push({id:`untracked-${day}`,kind:o.kind,quantity:remaining,opening:true,untracked:true,loadDate:null,formedDate:null,curedDate:null,firstRelease:dateStr(day),lastRelease:dateStr(day)});
 }
 return {receive,allocate};
}

// Keep every other cart's forming/load date fixed. Move only carts serving complete
// critical groups exclusively (or shared with other complete critical groups).
// Reserve backwards jointly, preserving each cart's first downstream release deadline.
// This is a feasible start-by estimate, not an optimality proof or an applied replan.
export function criticalStartReservations(s,rows){
 const all=rows.orderResults||[],groups=all.filter(o=>o.priority==='critical'),first=dateNum(s.settings.start),last=dateNum(s.settings.end),byLot=new Map(),g=s.settings;
 for(const o of all)for(const a of o.allocations||[]){if(!a.formedDate)continue;const list=byLot.get(a.id)||[];list.push({o,a});byLot.set(a.id,list);}
 const jobs=[],manualDays=new Set(rows.filter(r=>r.manualPlan).map(r=>r.date));
 for(const [id,uses] of byLot){if(!manualDays.has(uses[0].a.loadDate)&&uses.every(x=>x.o.priority==='critical'&&x.o.ready&&x.o.inPlan&&!x.o.partial)){
  const a=uses[0].a;jobs.push({id,kind:a.kind,original:dateNum(a.loadDate),due:Math.min(...uses.map(x=>Math.min(x.o.needBy,dateNum(x.a.firstRelease)))),groups:uses.map(x=>x.o.id)});
 }}
 const daily=new Map(rows.map(r=>[dateNum(r.date),r.load.thin+r.load.thick])),weekly=new Map(),occupied=new Map(rows.map(r=>[dateNum(r.date),{...r.oven}]));
 for(const r of rows)weekly.set(r.key,(weekly.get(r.key)||0)+r.load.thin+r.load.thick);
 for(const j of jobs){daily.set(j.original,daily.get(j.original)-1);const key=weekKey(dateStr(j.original));weekly.set(key,weekly.get(key)-1);for(let day=j.original;day<Math.min(last+1,j.original+g[j.kind+'Cure']);day++)occupied.get(day)[j.kind]--;}
 const reserved=[];let feasible=!rows.some(r=>r.overflow||r.cureConflict);
 if(feasible)for(const j of jobs.sort((a,b)=>b.due-a.due||b.original-a.original||a.id.localeCompare(b.id))){
  const cure=g[j.kind+'Cure'];let found=null;
  for(let day=Math.min(last-cure,j.due-cure);day>=first;day--){
   const date=dateStr(day),wk=weekKey(date);
   if(manualDays.has(date)||!canUnloadOn(day,s.holidays||[])||!canUnloadOn(day+cure,s.holidays||[])||(daily.get(day)||0)>=g.dailyCarts||(weekly.get(wk)||0)>=g.weeklyCarts)continue;
   let fit=true;for(let t=day;t<day+cure;t++){const n=occupied.get(t);if(!n||n.thin+n.thick>=Math.min(MAX_OVEN_CARTS,g.totalCarts)||n[j.kind]>=g[j.kind+'Carts']){fit=false;break;}}
   if(!fit)continue;
   found=day;daily.set(day,(daily.get(day)||0)+1);weekly.set(wk,(weekly.get(wk)||0)+1);for(let t=day;t<day+cure;t++)occupied.get(t)[j.kind]++;reserved.push({...j,date:dateStr(day),out:dateStr(day+cure)});break;
  }
  if(found==null){feasible=false;break;}
 }
 return {feasible,reserved:feasible?reserved:[],groups:new Map(groups.map(o=>{
  const formed=(o.allocations||[]).filter(a=>a.formedDate),moving=new Set(jobs.map(x=>x.id));
  const dates=formed.map(a=>moving.has(a.id)?reserved.find(x=>x.id===a.id)?.date:a.formedDate).filter(Boolean);
  const startBy=feasible&&o.ready&&o.inPlan&&!o.partial&&dates.length?dates.sort()[0]:null;
  return [o.id,{startBy,sharedFixed:formed.some(a=>!moving.has(a.id)),feasible:feasible&&!!o.ready&&!o.partial}];
 }))};
}
export function criticalMilestones(s,rows,reservations=criticalStartReservations(s,rows)){
 return new Map((rows.orderResults||[]).filter(o=>o.priority==='critical').map(o=>{
  const allocations=o.allocations||[],formed=allocations.filter(a=>a.formedDate),knownCures=allocations.filter(a=>a.curedDate),min=(a,k)=>a.length?a.map(x=>x[k]).sort()[0]:null,max=(a,k)=>a.length?a.map(x=>x[k]).sort().at(-1):null;
  const projected=o.batchFlow?.batches.length?o.batchFlow:null,r=reservations.groups.get(o.id)||{},complete=!!o.ready&&o.inPlan&&!o.partial;
  return [o.id,{...r,complete,formingStart:min(formed,'formedDate'),formingFinish:complete?max(formed,'formedDate'):null,firstCure:min(knownCures,'curedDate'),finalCure:complete?max(knownCures,'curedDate'):null,firstRelease:min(allocations,'firstRelease'),finalRelease:o.ready,openingPanels:allocations.filter(a=>a.opening).reduce((n,a)=>n+a.quantity,0),newPanels:formed.reduce((n,a)=>n+a.quantity,0),downstream:projected,untracked:allocations.some(a=>a.untracked)}];
 }));
}
