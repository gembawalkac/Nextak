import {holidayWindows} from './holiday-prep.js';
export const MAX_OVEN_CARTS=10;
// Calendar-day cure deadlines must land on a staffed, non-holiday unloading day.
export function canUnloadOn(day,holidays=[]){return !holidayWindows(holidays).some(w=>day>=w.start&&day<=w.end)}
// Used only to show the earliest possible removal for conflicting opening-cart inputs.
export function nextUnloadDay(cureDay,holidays=[]){
 let day=cureDay;
 for(const w of holidayWindows(holidays))if(day>=w.start&&day<=w.end)day=w.end+1;
 return day;
}
export function applyOvenUpdate(s){
 s.updates??=[];
 const key='oven-capacity-10-holiday-unloading';
 if(!s.updates.includes(key)){
  // Retain deliberately smaller caps, and replace the former nine-cart default.
  if(s.settings.totalCarts===9||s.settings.totalCarts>MAX_OVEN_CARTS)s.settings.totalCarts=MAX_OVEN_CARTS;
  s.updates.push(key);
 }
 return s;
}
