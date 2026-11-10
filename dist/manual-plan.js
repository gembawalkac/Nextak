import {dateNum,dateStr,weekKey,kinds} from './model.js';
import {canUnloadOn} from './oven.js';

const total=x=>x.thin+x.thick;
const count=()=>({thin:0,thick:0});

export function validateManualLoads(entries){
 if(entries==null)return;
 if(typeof entries!=='object'||Array.isArray(entries))throw Error('Invalid weekly cart plan.');
 for(const [date,mix] of Object.entries(entries)){
  if(!Number.isFinite(dateNum(date))||dateStr(dateNum(date))!==date||!mix||!kinds.every(k=>Number.isSafeInteger(mix[k])&&mix[k]>=0))throw Error('Enter a whole number of carts, zero or greater, for each day.');
 }
}

// Reserve feasible manual days before filling gaps with automatic production.
export function reserveManualLoads(s,openingLoads,first,last){
 const g=s.settings,records=new Map(),bookings=[],weekly=new Map();
 const occupied=(loads,day)=>{const mix=count();for(const x of loads)if(!x.done&&x.out>day)mix[x.kind]+=x.carts;return mix;};
 for(const [date,requested] of Object.entries(s.manualLoads||{}).sort(([a],[b])=>a.localeCompare(b))){
  const day=dateNum(date);if(day<first||day>last)continue;
  const key=weekKey(date),used=weekly.get(key)||0,issues=[],load=count();
  if(total(requested)){
   const oven=occupied([...openingLoads,...bookings],day);
   if(!canUnloadOn(day,s.holidays||[]))issues.push('Forming is closed for a holiday');
   if(total(requested)>g.dailyCarts)issues.push(`Daily limit is ${g.dailyCarts} carts`);
   if(total(requested)+used>g.weeklyCarts)issues.push(`Weekly limit is ${g.weeklyCarts} carts`);
   if(total(requested)+total(oven)>g.totalCarts)issues.push(`Oven limit is ${g.totalCarts} carts`);
   for(const k of kinds)if(requested[k]){
    const label=k==='thin'?'3/4″':'1 1/8″';
    if(oven[k]+requested[k]>g[k+'Carts'])issues.push(`${label} oven limit is ${g[k+'Carts']} carts`);
    if(!canUnloadOn(day+g[k+'Cure'],s.holidays||[]))issues.push(`${label} cure would end on a holiday`);
   }
   if(!issues.length){
    for(const k of kinds)load[k]=requested[k];
    weekly.set(key,used+total(load));
    for(const k of kinds)if(load[k])bookings.push({day,kind:k,carts:load[k],out:day+g[k+'Cure']});
   }
  }
  records.set(day,{requested,load,issues,key});
 }
 function weeklyReservedAfter(day,key){let n=0;for(const [t,r] of records)if(t>day&&r.key===key)n+=total(r.load);return n;}
 function fitsBeforeReservations(day,kind,loads,today){
  for(const [t,r] of records){
   if(t<=day||t>=day+g[kind+'Cure']||!total(r.load))continue;
   const oven=occupied(loads,t);
   for(const b of bookings)if(b.day>day&&b.day<=t&&b.out>t)oven[b.kind]+=b.carts;
   for(const k of kinds)if(day+g[k+'Cure']>t)oven[k]+=today[k];
   oven[kind]++;
   if(total(oven)>g.totalCarts||kinds.some(k=>oven[k]>g[k+'Carts']))return false;
  }
  return true;
 }
 return {records,weeklyReservedAfter,fitsBeforeReservations};
}
