import {dateNum,dateStr} from './simple-model.js';
export function monthGrid(month){const first=dateNum(month+'-01'),d=new Date(first*86400000),next=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)/86400000,start=first-(d.getUTCDay()+6)%7,end=next-1+(7-new Date((next-1)*86400000).getUTCDay())%7;return Array.from({length:end-start+1},(_,i)=>dateStr(start+i))}
export function shiftedMonth(month,by){const d=new Date(month+'-01T12:00Z');d.setUTCMonth(d.getUTCMonth()+by);return d.toISOString().slice(0,7)}
