import {dateNum,dateStr,sheets as rawSheets} from './model.js';
export const SHIFT_HOURS=10;
export const BUILD_STEPS=[['lamination','Lamination'],['waterjet','Waterjet'],['staging','Cut-parts staging'],['assembly','OXB assembly'],['qc','OXB QC']];
const EPS=1e-8;
export const skipsLamination=p=>/^AT-OXB-787(?:-|$)/i.test(p.id);
export function validateStepHours(value){
 if(value==null)return;
 if(typeof value!=='object'||Array.isArray(value))throw Error('Downstream step times must be a list of hours.');
 for(const [key] of BUILD_STEPS){const n=value[key];if(n!=null&&(!Number.isFinite(n)||n<0||n>3650))throw Error('Step times must be from 0 to 3,650 working hours, or blank.');}
}
export function buildRoute(s,p,week,{ignoreOrderOverrides=false}={}){
 const m=p.delivery?.[week]||{},defaults=m.priority==='critical'?s.settings.stepHours:null;
 const sheets=Math.max(0,Math.ceil(rawSheets(p,week)-1e-9)),cases=Number(p.qty[week]||0),hours={},rateDetails={};let needsCases=false;
 for(const [key] of BUILD_STEPS){
  // OXB-787 products bypass lamination, including older saved profiles.
  if(key==='lamination'&&skipsLamination(p)){hours[key]=0;continue;}
  const override=ignoreOrderOverrides?null:m.stepHours?.[key],rate=p.stepRates?.[key];
  if(override!=null){hours[key]=override;continue;}
  if(rate!=null){
   const quantity=key==='lamination'?sheets:cases,basis=key==='lamination'?'sheets':'cases';
   hours[key]=rate===0?0:quantity>0?Number((rate*quantity/20).toFixed(6)):null;
   rateDetails[key]={rate,quantity,basis};if(rate>0&&quantity<=0&&basis==='cases')needsCases=true;
  }else hours[key]=p.stepHours?.[key]??defaults?.[key]??null;
 }
 return {hours,rateDetails,needsCases,complete:BUILD_STEPS.every(([key])=>hours[key]!=null),total:Number(BUILD_STEPS.reduce((n,[key])=>n+(hours[key]??0),0).toFixed(6))};
}
function closed(s,day,key){const date=dateStr(day);return (s.holidays||[]).some(h=>date>=h.start&&date<=h.end)||(key==='waterjet'&&s.shutdowns.some(h=>date>=h.start&&date<=h.end));}
// Akro is released at shift end. Downstream stages share the following 10-hour shifts.
// A zero-hour stage is an explicit bypass. No clock time is claimed by this date-only plan.
export function downstreamMilestones(s,ready,route){
 if(!ready||!route?.complete)return null;
 let day=dateNum(ready),hour=SHIFT_HOURS;const steps=[];
 for(const [key,label] of BUILD_STEPS){let left=route.hours[key],start=null,finish=ready;
  if(left<=EPS){steps.push({key,label,hours:0,start:dateStr(day),finish:dateStr(day),skipped:true});continue;}
  let guard=0;
  while(left>EPS){
   if(++guard>10000)throw Error('Step schedule exceeds supported date range.');
   if(hour>=SHIFT_HOURS-EPS){day++;hour=0;}
   if(closed(s,day,key)){day++;hour=0;continue;}
   start??=dateStr(day);const take=Math.min(left,SHIFT_HOURS-hour);left-=take;hour+=take;finish=dateStr(day);
  }
  steps.push({key,label,hours:route.hours[key],start,finish,skipped:false});
 }
 return {steps,finish:dateStr(day)};
}
export function latestAkroDate(s,target,route){
 if(!route?.complete)return null;
 const releaseDate=day=>{let guard=0;while(closed(s,day,'waterjet')){day--;if(++guard>10000)throw Error('Step schedule exceeds supported date range.');}return dateStr(day);};
 if(route.total<=EPS)return releaseDate(dateNum(target));
 let day=dateNum(target),hour=SHIFT_HOURS;
 for(const [key] of [...BUILD_STEPS].reverse()){
  let left=route.hours[key],guard=0;
  while(left>EPS){
   if(++guard>10000)throw Error('Step schedule exceeds supported date range.');
   if(hour<=EPS){day--;hour=SHIFT_HOURS;}
   if(closed(s,day,key)){day--;hour=SHIFT_HOURS;continue;}
   const take=Math.min(left,hour);left-=take;hour-=take;
  }
 }
 // All Akro must be released by the end of the shift before downstream begins.
 return releaseDate(day-1);
}
