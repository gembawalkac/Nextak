import {sheets} from './model.js';

export function markDemandRevision(s,seed){
 const revision=seed.demandRevision;
 if(!revision)return s;
 s.updates??=[];
 if(!s.updates.includes(revision.id))s.updates.push(revision.id);
 return s;
}

// Replace only supplied product/week demand. Later edits, plan settings and
// demand outside the pasted table are retained.
export function applyDemandRevision(s,seed){
 const revision=seed.demandRevision;
 if(!revision||s.updates?.includes(revision.id))return s;
 const weeks=new Set(revision.weeks),byId=new Map(s.parts.map(p=>[p.id,p]));
 for(const input of seed.parts){
  if(revision.products&&!revision.products.includes(input.id))continue;
  let p=byId.get(input.id);
  if(!p){
   if(!revision.weeks.some(w=>sheets(input,w)>0))continue;
   p={id:input.id,thickness:input.thickness,factor:input.factor,qty:{},overrides:{}};s.parts.push(p);
  }
  for(const week of weeks){
   delete p.qty[week];delete p.overrides[week];
   if(Object.hasOwn(input.qty,week))p.qty[week]=input.qty[week];
   if(Object.hasOwn(input.overrides,week))p.overrides[week]=input.overrides[week];
  }
  p.sourceTotal=Number([...new Set([...Object.keys(p.qty),...Object.keys(p.overrides)])].reduce((sum,w)=>sum+sheets(p,w),0).toFixed(6));
 }
 const present=new Set(s.weeks.map(w=>w.key));
 s.weeks.push(...seed.weeks.filter(w=>weeks.has(w.key)&&!present.has(w.key)).map(w=>({...w})));
 s.weeks.sort((a,b)=>a.date.localeCompare(b.date));
 return markDemandRevision(s,seed);
}
