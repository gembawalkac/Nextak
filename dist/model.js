export const DAY=86400000;
export const dateNum=s=>Math.round(Date.parse(s+'T00:00:00Z')/DAY);
export const dateStr=n=>new Date(n*DAY).toISOString().slice(0,10);
export function weekStart(year,week){let j=dateNum(`${year}-01-04`);return dateStr(j-((new Date(j*DAY).getUTCDay()+6)%7)+(week-1)*7)}
export function weekKey(date){let d=new Date(dateNum(date)*DAY);d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));let y=d.getUTCFullYear();return `${y}-W${String(Math.ceil(((d-new Date(Date.UTC(y,0,1)))/DAY+1)/7)).padStart(2,'0')}`}
export const kinds=['thin','thick'];
export function sheets(part,key){return Object.hasOwn(part.overrides,key)?Number(part.overrides[key]):Number(part.qty[key]||0)*part.factor}
export function defaults(seed){return {version:1,parts:structuredClone(seed.parts),weeks:structuredClone(seed.weeks),sourceTotal:seed.sourceTotal,settings:{start:'2026-11-02',end:'2027-07-04',asOf:'2026-11-02',thinStart:0,thickStart:0,thinWaiting:0,thickWaiting:0,verified:false,thinBacklog:0,thickBacklog:0,thinTarget:120,thickTarget:360,thinCure:3,thickCure:5,thinCarts:9,thickCarts:8,totalCarts:9,dailyCarts:2,weeklyCarts:12,cartSize:20,batchSize:40,transfer:0,withdrawCap:0,lead:0,mode:'suggested'},shutdowns:[{start:'2026-11-05',end:'2026-11-14'}],initialLoads:[],daily:{},preloads:['shutdown-2026-11-05']}}
// Apply this authorized update once to existing browser plans and older backups.
export function applyPreloads(s){
 const key='shutdown-2026-11-05';
 if(!(s.preloads||[]).includes(key)){
  if(!s.shutdowns.some(x=>x.start==='2026-11-05'&&x.end==='2026-11-14'))s.shutdowns.push({start:'2026-11-05',end:'2026-11-14'});
  s.settings.thinCure=3;s.settings.thickCure=5;
  s.preloads=[...(s.preloads||[]),key];
 }
 return s;
}
export function validate(s){
 if(!s||s.version!==1||!Array.isArray(s.parts)||!Array.isArray(s.weeks)||!s.settings)throw Error('This is not an Akro Planner backup.');
 let a=dateNum(s.settings.start),b=dateNum(s.settings.end);if(!Number.isFinite(a)||!Number.isFinite(b)||b<a||b-a>730)throw Error('Choose a horizon from 1 to 731 days.');
 for(const [k,v]of Object.entries(s.settings)){if(typeof v==='number'&&(!Number.isFinite(v)||v<0))throw Error(`${k} must be zero or greater.`)}
 for(const k of ['cartSize','batchSize','thinCure','thickCure'])if(!(s.settings[k]>0))throw Error(`${k} must be greater than zero.`);
 for(const k of ['dailyCarts','weeklyCarts','thinCarts','thickCarts','totalCarts','cartSize','batchSize','transfer','lead'])if(!Number.isInteger(s.settings[k]))throw Error(`${k} must be a whole number.`);
 for(const p of s.parts){if(!p.id||!kinds.includes(p.thickness)||!Number.isFinite(p.factor)||p.factor<=0)throw Error('Each part needs a unique name, thickness and positive sheets/case.');for(const v of [...Object.values(p.qty),...Object.values(p.overrides)])if(!Number.isFinite(v)||v<0)throw Error(`Demand must be nonnegative for ${p.id}.`)}
 if(new Set(s.parts.map(p=>p.id)).size!==s.parts.length)throw Error('Part numbers must be unique.');
 for(const w of s.weeks)if(weekKey(w.date)!==w.key)throw Error(`Invalid ISO week ${w.key}.`);
 for(const x of s.shutdowns)if(!Number.isFinite(dateNum(x.start))||!Number.isFinite(dateNum(x.end))||x.end<x.start)throw Error('Shutdown end must be on or after its start.');
 for(const x of s.initialLoads){if(!kinds.includes(x.kind)||!Number.isInteger(x.carts)||x.carts<1||!Number.isFinite(dateNum(x.date))||x.date>=s.settings.start)throw Error('Initial oven loads need whole carts and a load date before the forecast start.');}
 for(const d of Object.values(s.daily)){for(const k of ['thin','thick'])if(d[k]!=null&&(!Number.isInteger(d[k])||d[k]<0))throw Error('Cart loads must be nonnegative whole numbers.');for(const k of ['countThin','countThick'])if(d[k]!=null&&(!Number.isFinite(d[k])||d[k]<0))throw Error('Physical counts must be nonnegative.');}
 return s;
}
export function demandMap(s){const m=new Map();for(const w of s.weeks)for(const p of s.parts){let n=sheets(p,w.key)/7;if(!n)continue;for(let j=0;j<7;j++){let d=dateNum(w.date)+j-s.settings.lead;let r=m.get(d)||{thin:0,thick:0};r[p.thickness]+=n;m.set(d,r)}}return m}
export function simulate(s){validate(s);const g=s.settings,start=dateNum(g.start),end=dateNum(g.end),dm=demandMap(s),rows=[],loads=[],queue=[],weekly=new Map();let inv={thin:g.thinStart,thick:g.thickStart},waiting={thin:g.thinWaiting||0,thick:g.thickWaiting||0};
 for(const k of kinds)if(g[k+'Backlog'])queue.push({kind:k,qty:g[k+'Backlog'],due:start-1});
 for(const x of s.initialLoads)loads.push({kind:x.kind,carts:x.carts,load:dateNum(x.date),unload:dateNum(x.date)+Math.ceil(g[x.kind+'Cure'])+1,available:dateNum(x.date)+Math.ceil(g[x.kind+'Cure'])+1+g.transfer,processed:false,initial:true});
 for(let day=start;day<=end;day++){
  const date=dateStr(day),key=weekKey(date),o=s.daily[date]||{},flags=[],opening={...inv},receipt={thin:0,thick:0},released={thin:0,thick:0},used={thin:0,thick:0},adjust={thin:0,thick:0};
  for(const x of loads)if(!x.processed&&x.available<=day){waiting[x.kind]+=x.carts*g.cartSize;receipt[x.kind]+=x.carts*g.cartSize;x.processed=true}
  for(const k of kinds){released[k]=Math.floor((waiting[k]+1e-8)/g.batchSize)*g.batchSize;waiting[k]-=released[k];inv[k]+=released[k]}
  const demand=dm.get(day)||{thin:0,thick:0};for(const k of kinds)if(demand[k])queue.push({kind:k,qty:demand[k],due:day});
  const closed=s.shutdowns.some(x=>date>=x.start&&date<=x.end);let cap=g.withdrawCap>0?g.withdrawCap:Infinity;
  if(!closed)for(const q of queue){let take=Math.max(0,Math.min(q.qty,inv[q.kind],cap));q.qty-=take;inv[q.kind]-=take;used[q.kind]+=take;cap-=take}
  while(queue.length&&queue[0].qty<1e-8)queue.shift();
  const backlog={thin:0,thick:0};for(const q of queue)backlog[q.kind]+=q.qty;
  for(const k of kinds){let count=o[k==='thin'?'countThin':'countThick'];if(count!=null){adjust[k]=count-inv[k];inv[k]=count}}
  const occupiedBefore={thin:0,thick:0};for(const x of loads)if(x.unload>day)occupiedBefore[x.kind]+=x.carts;
  if(occupiedBefore.thin+occupiedBefore.thick>g.totalCarts||occupiedBefore.thin>g.thinCarts||occupiedBefore.thick>g.thickCarts)flags.push('Opening oven exceeds capacity');
  let accepted={thin:0,thick:0},requested={thin:0,thick:0},usedWeek=weekly.get(key)||0;
  function can(k){return accepted.thin+accepted.thick<g.dailyCarts&&usedWeek+accepted.thin+accepted.thick<g.weeklyCarts&&occupiedBefore.thin+occupiedBefore.thick+accepted.thin+accepted.thick<g.totalCarts&&occupiedBefore[k]+accepted[k]<g[k+'Carts']}
  function future(k){let sum=0;for(let t=day+1;t<=day+Math.ceil(g[k+'Cure'])+1+g.transfer+2;t++)sum+=(dm.get(t)||{})[k]||0;return sum}
  function deficit(k){let pipe=waiting[k];for(const x of loads)if(!x.processed)pipe+=x.kind===k?x.carts*g.cartSize:0;const need=Math.max(0,g[k+'Target']+backlog[k]+future(k)-inv[k]);const pallets=Math.ceil((need-1e-8)/g.batchSize)*g.batchSize;return pallets-pipe-accepted[k]*g.cartSize}
  const manual=o.thin!=null||o.thick!=null||g.mode==='manual';
  if(manual){requested={thin:o.thin||0,thick:o.thick||0};for(const k of ['thick','thin'])for(let n=0;n<requested[k];n++)if(can(k))accepted[k]++;if(requested.thin+requested.thick!==accepted.thin+accepted.thick)flags.push('Some requested carts cannot load; reschedule them');}
  else for(let n=0;n<g.dailyCarts;n++){let candidates=kinds.filter(k=>can(k)&&deficit(k)>1e-8).sort((a,b)=>deficit(b)/Math.max(1,g[b+'Target'])-deficit(a)/Math.max(1,g[a+'Target']));if(!candidates.length)break;accepted[candidates[0]]++} 
  if(!manual)requested={...accepted};
  weekly.set(key,usedWeek+accepted.thin+accepted.thick);
  for(const k of kinds)if(accepted[k])loads.push({kind:k,carts:accepted[k],load:day,unload:day+Math.ceil(g[k+'Cure'])+1,available:day+Math.ceil(g[k+'Cure'])+1+g.transfer,processed:false});
  let oven={thin:0,thick:0},pipeline={thin:0,thick:0};for(const x of loads){if(x.unload>day)oven[x.kind]+=x.carts;if(!x.processed)pipeline[x.kind]+=x.carts*g.cartSize}
  if(backlog.thin+backlog.thick>1e-6)flags.push(closed?'Demand waiting during shutdown':'Unserved demand');
  for(const k of kinds)if(inv[k]>g[k+'Target']+1e-6)flags.push(`${k==='thin'?'3/4':'1 1/8'} stock above target`);
  rows.push({date,key,opening,demand:{...demand},closed,receipt,released,used,adjust,inv:{...inv},backlog,waiting:{...waiting},pipeline,oven,accepted,requested,manual,flags});
 }
 const weeks=[];for(const r of rows){let w=weeks.find(x=>x.key===r.key);if(!w){w={key:r.key,start:r.date,demand:{thin:0,thick:0},used:{thin:0,thick:0},carts:{thin:0,thick:0},released:{thin:0,thick:0},closed:0};weeks.push(w)}for(const k of kinds){w.demand[k]+=r.demand[k];w.used[k]+=r.used[k];w.carts[k]+=r.accepted[k];w.released[k]+=r.released[k]}w.closed+=r.closed?1:0;w.inv=r.inv;w.backlog=r.backlog;w.end=r.date}
 return {rows,weeks,loads};
}
