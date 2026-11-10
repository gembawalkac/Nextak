import {BUILD_STEPS,SHIFT_HOURS} from './downstream.js';
import {dateNum,dateStr} from './model.js';
export const TRANSFER_SHEETS=20;
const EPS=1e-7;
const closed=(s,day,key)=>{
 const date=dateStr(day);
 return (s.holidays||[]).some(h=>date>=h.start&&date<=h.end)||(key==='waterjet'&&(s.shutdowns||[]).some(h=>date>=h.start&&date<=h.end));
};
const startDate=t=>dateStr(Math.floor((t+EPS)/SHIFT_HOURS));
const finishDate=(t,start)=>dateStr(t>start+EPS?Math.ceil((t-EPS)/SHIFT_HOURS)-1:Math.floor((t+EPS)/SHIFT_HOURS));
export function sheetBatches(total){
 const batches=[];for(let first=0;first<total;first+=TRANSFER_SHEETS)batches.push(Math.min(TRANSFER_SHEETS,total-first));return batches;
}
function nextOpen(s,time,key){
 let day=Math.floor((time+EPS)/SHIFT_HOURS),hour=Math.max(0,time-day*SHIFT_HOURS),guard=0;
 while(closed(s,day,key)){day++;hour=0;if(++guard>20000)throw Error('Batch schedule exceeds supported date range.');}
 return day*SHIFT_HOURS+hour;
}
// Time is measured in ten-hour shifts. Integer date boundaries represent the
// next shift's start; holidays and waterjet-only closures are skipped by step.
export function forwardWork(s,time,key,hours){
 if(hours<=EPS)return {start:time,finish:time};
 const start=nextOpen(s,time,key);let at=start,left=hours,guard=0;
 while(left>EPS){
  if(++guard>20000)throw Error('Batch schedule exceeds supported date range.');
  at=nextOpen(s,at,key);const day=Math.floor((at+EPS)/SHIFT_HOURS),hour=Math.max(0,at-day*SHIFT_HOURS),take=Math.min(left,SHIFT_HOURS-hour);
  left-=take;at+=take;
 }
 return {start,finish:at};
}
function runStep(s,index,at,hours,bypassDate){
 const [key,label]=BUILD_STEPS[index],timing=forwardWork(s,at,key,hours),skipped=hours<=EPS;
 return {key,label,hours,start:skipped?bypassDate:startDate(timing.start),finish:skipped?bypassDate:finishDate(timing.finish,timing.start),startTime:timing.start,finishTime:timing.finish,skipped};
}

// The waterjet requests material only when it can take another batch. A batch
// that needs lamination reserves that slot while it is prepared; no second
// batch can be taken out of the supermarket to wait behind it.
export function createWaterjetPull(s){
 let waterjetFree=-Infinity,laminationFree=-Infinity;
 const hours=(o,sheets,key)=>o.route.hours[key]*sheets/o.total;
 function next(o,sheets,day){
  const at=Math.max(day*SHIFT_HOURS,hours(o,sheets,'waterjet')>EPS?waterjetFree:-Infinity,hours(o,sheets,'lamination')>EPS?laminationFree:-Infinity);
  return at<(day+1)*SHIFT_HOURS-EPS?at:null;
 }
 function pull(o,sheets,at){
  const date=startDate(at),lam=runStep(s,0,at,hours(o,sheets,'lamination'),date),jet=runStep(s,1,lam.finishTime,hours(o,sheets,'waterjet'),lam.finish);
  if(!lam.skipped)laminationFree=lam.finishTime;
  if(!jet.skipped)waterjetFree=jet.finishTime;
  return {date,sheets,steps:[lam,jet]};
 }
 return {next,pull};
}
function backwardWork(s,time,key,hours){
 let at=time,left=hours,guard=0;
 while(left>EPS){
  if(++guard>20000)throw Error('Batch schedule exceeds supported date range.');
  const day=Math.ceil((at-EPS)/SHIFT_HOURS)-1,hour=at-day*SHIFT_HOURS;
  if(closed(s,day,key)){at=day*SHIFT_HOURS;continue;}
  const take=Math.min(left,hour);left-=take;at-=take;
 }
 return at;
}
// Backward flow within this order supplies batch deadlines, not a promise of
// shared capacity. The forward queue below assesses all modeled orders together.
export function requiredBatchReleases(s,target,route,total){
 if(!route.complete)return [];
 const quantities=sheetBatches(total),free=BUILD_STEPS.map(()=> (dateNum(target)+1)*SHIFT_HOURS),result=[];
 let intakeFree=(dateNum(target)+1)*SHIFT_HOURS;
 for(let i=quantities.length-1;i>=0;i--){
  let at=(dateNum(target)+1)*SHIFT_HOURS;
  for(let step=BUILD_STEPS.length-1;step>=0;step--){
   const key=BUILD_STEPS[step][0],hours=route.hours[key]*quantities[i]/total;
   if(hours<=EPS)continue;
   at=backwardWork(s,Math.min(at,free[step],key==='waterjet'?intakeFree:Infinity),key,hours);free[step]=at;
  }
  // Do not plan a second intake before the preceding batch leaves waterjet.
  // A withdrawal must occur on an open day, even if lamination is next.
  const plannedDay=route.total<=EPS?dateNum(target):Math.floor((at+EPS)/SHIFT_HOURS);
  let day=plannedDay;
  while(closed(s,day,'waterjet'))day--;
  if(route.hours.waterjet>EPS)intakeFree=day===plannedDay?at:day*SHIFT_HOURS;
  result.unshift({index:i+1,sheets:quantities[i],date:dateStr(day)});
 }
 return result;
}

export function scheduleBatchFlow(s,orders){
 const jobs=[],free=BUILD_STEPS.map(()=>-Infinity),results=new Map();
 for(const o of orders){
  if(!o.inPlan||!o.route.complete)continue;
  const batches=(o.transfers||[]).map((b,i)=>({index:i+1,sheets:b.sheets,release:b.date,steps:[...(b.steps||[])]}));
  const result={batches,steps:[],finish:null,complete:!!o.ready,expectedBatches:Math.ceil(o.total/TRANSFER_SHEETS),releasedSheets:o.filled};results.set(o.id,result);
  for(const batch of batches)jobs.push({o,batch,step:batch.steps.length,at:batch.steps.at(-1)?.finishTime??dateNum(batch.release)*SHIFT_HOURS});
 }
 // Earliest feasible operation first. Critical groups win equal-time queues;
 // once an operation begins it is not interrupted by a newly arriving group.
 while(jobs.length){
  let chosen=0,best=null;
  for(let i=0;i<jobs.length;i++){
   const j=jobs[i],key=BUILD_STEPS[j.step][0],hours=j.o.route.hours[key]*j.batch.sheets/j.o.total;
   const at=hours<=EPS?j.at:nextOpen(s,Math.max(j.at,free[j.step]),key);
   const rank=[at,j.o.priority==='critical'?0:1,j.o.needBy,j.o.id,j.batch.index,j.step];
   if(!best||rank.some((v,n)=>v<best[n]&&rank.slice(0,n).every((x,k)=>x===best[k]))){chosen=i;best=rank;}
  }
  const j=jobs.splice(chosen,1)[0],key=BUILD_STEPS[j.step][0],hours=j.o.route.hours[key]*j.batch.sheets/j.o.total;
  const timing=runStep(s,j.step,hours<=EPS?j.at:Math.max(j.at,free[j.step]),hours,j.batch.steps.at(-1)?.finish||j.batch.release);
  j.batch.steps.push(timing);
  if(hours>EPS)free[j.step]=timing.finishTime;
  if(++j.step<BUILD_STEPS.length){j.at=timing.finishTime;jobs.push(j);}
 }
 for(const o of orders){
  const r=results.get(o.id);if(!r||!r.batches.length)continue;
  r.steps=BUILD_STEPS.map(([key,label])=>{
   const stages=r.batches.map(b=>b.steps.find(x=>x.key===key)),start=stages.map(x=>x.start).sort()[0],lastBatchFinish=stages.map(x=>x.finish).sort().at(-1);
   return {key,label,hours:o.route.hours[key],start,finish:r.complete?lastBatchFinish:null,lastBatchFinish,skipped:o.route.hours[key]<=EPS};
  });
  if(r.complete)r.finish=r.batches.map(b=>b.steps.at(-1).finish).sort().at(-1);
 }
 return results;
}
