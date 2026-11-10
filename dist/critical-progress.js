import {kinds,dateStr} from './model.js';
// Partition common stock and oven supply among critical groups once, in priority order.
// These allocations describe the forecast; they never change physical inventory.
export function criticalSnapshot(orders,day,inventory,loads){
 const stock={...inventory},pipeline={};
 for(const k of kinds)pipeline[k]=loads.filter(x=>!x.done&&!x.conflict&&x.kind===k).sort((a,b)=>a.out-b.out).map(x=>({out:x.out,sheets:x.carts*20}));
 return orders.filter(o=>o.priority==='critical').map(o=>{
  const remaining=o.total-o.filled,eligible=o.inPlan&&o.needBy<=day+28;
  const reserved=eligible?Math.min(remaining,stock[o.kind]):0;stock[o.kind]-=reserved;
  let need=remaining-reserved,inOven=0,lateOven=0,nextOvenOut=null;
  if(eligible)for(const batch of pipeline[o.kind]){
   const take=Math.min(need,batch.sheets);if(!take)continue;
   batch.sheets-=take;need-=take;inOven+=take;
   if(batch.out>o.needBy)lateOven+=take;
   nextOvenOut??=dateStr(batch.out);
  }
  const ready=o.filled+reserved;
  return {id:o.id,total:o.total,filled:o.filled,reserved,inOven,lateOven,nextOvenOut,uncovered:remaining-reserved-inOven,ready,percent:ready/o.total*100,active:eligible};
 });
}
export function criticalDate(start,end,date){return !date||date<start?start:date>end?end:date}
export function criticalProgressCsv(orders,rows){
 const groups=new Map(orders.filter(o=>o.priority==='critical').map(o=>[o.id,o])),cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';
 const data=[['Date','Part','Week','Cases','Required_sheets','Released_to_downstream','Reserved_in_supermarket','In_oven_sheets','In_oven_late_sheets','Next_oven_out','Uncovered_sheets','Akro_ready_sheets','Akro_ready_percent']];
 for(const r of rows)for(const x of r.criticalProgress||[]){const o=groups.get(x.id);if(o)data.push([r.date,o.part,o.week,o.cases,x.total,x.filled,x.reserved,x.inOven,x.lateOven,x.nextOvenOut,x.uncovered,x.ready,Math.round(x.percent*10)/10]);}
 return data.map(r=>r.map(cell).join(',')).join('\n');
}
