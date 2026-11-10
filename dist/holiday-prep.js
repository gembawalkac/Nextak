const DAY=86400000;
const n=s=>Math.round(Date.parse(s+'T00:00:00Z')/DAY);
export function holidayWindows(holidays=[]){const merged=[];for(const h of holidays.map(x=>({start:n(x.start),end:n(x.end),names:[x.name?.trim()||'Holiday']})).sort((a,b)=>a.start-b.start)){const p=merged.at(-1);if(p&&h.start<=p.end+1){p.end=Math.max(p.end,h.end);p.names=[...new Set([...p.names,...h.names])]}else merged.push(h)}return merged}
// A bounded dispatch preference: protect both thicknesses through reopening,
// then use needed longer-cure work to keep the oven occupied during a closure.
export function holidayChoice({day,candidates,cure,windows,need}){const w=windows.find(w=>day<w.start&&candidates.some(k=>day+cure[k]>w.start));if(!w)return null;const returnDay=w.end+1;
const ranked=candidates.map(k=>({kind:k,overlap:Math.max(0,Math.min(day+cure[k],returnDay)-w.start)})).sort((a,b)=>b.overlap-a.overlap||cure[b.kind]-cure[a.kind]);const best=ranked[0];if(!best||best.overlap<=0||ranked.every(x=>x.overlap===best.overlap))return null;
if(need(best.kind,returnDay+cure[best.kind])<=0)return null;
if(candidates.some(k=>k!==best.kind&&need(k,returnDay+cure[k]-1)>0))return null;
return {kind:best.kind,name:w.names.join(' / '),start:w.start,end:w.end};}
export function applyHolidayPrepUpdate(s){s.holidays??=[];s.settings.holidayPrep??=true;s.updates??=[];const key='thanksgiving-2026-11-25';if(!s.updates.includes(key)){if(!s.holidays.some(h=>h.start<='2026-11-25'&&h.end>='2026-11-27'))s.holidays.push({name:'Thanksgiving',start:'2026-11-25',end:'2026-11-27'});s.updates.push(key)}return s}
