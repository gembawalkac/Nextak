import {dateNum,dateStr,weekKey,weekStart} from './model.js';

export function weekMonday(date){const [year,week]=weekKey(date).split('-W');return weekStart(Number(year),Number(week));}
export function weekDates(monday){return Array.from({length:7},(_,i)=>dateStr(dateNum(monday)+i));}
const dayLabel=date=>new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(dateNum(date)*86400000));
const sum=mix=>mix.thin+mix.thick;
const mixLabel=mix=>`${mix.thin} / ${mix.thick}`;

export function manualWeekView(s,rows,monday,today,message){
 const dates=weekDates(monday),current=weekMonday(today),byDate=new Map(rows.map(r=>[r.date,r])),weeks=[...new Set([current,monday,...rows.map(r=>weekMonday(r.date))])].sort();
 const visible=dates.map(date=>byDate.get(date)).filter(Boolean),scheduled=visible.reduce((n,r)=>n+sum(r.load),0),locked=visible.filter(r=>r.manualPlan).length,conflicts=visible.filter(r=>r.manualPlan?.issues.length).length;
 const status=message||'Edit the cart counts, then save to update the forecast.';
 return `<section class="card manual-week"><div class="toolbar"><div><span class="eyebrow">FORMING & OVEN</span><h2 class="tabletitle">Weekly cart plan</h2><p>Set the days you know. The planner fills in the rest.</p></div><button id="viewManualCalendar">View week in cart calendar ↗</button></div>
 <div class="manual-week-controls"><label>Planning week <select id="manualWeek" aria-label="Planning week">${weeks.map(w=>`<option value="${w}" ${w===monday?'selected':''}>${weekKey(w)} · ${dayLabel(w)}${w===current?' (this week)':''}</option>`).join('')}</select></label><button id="manualThisWeek" ${monday===current?'disabled':''}>This week</button><span class="small">${scheduled} / ${s.settings.weeklyCarts} carts scheduled · ${locked} manual ${locked===1?'day':'days'}</span>${conflicts?`<span class="badge red">${conflicts} ${conflicts===1?'day needs':'days need'} correction</span>`:''}</div>
 <p class="manual-guide">Leave both boxes blank for automatic planning. Enter a number to lock the day; a blank thickness on a manual day counts as 0. Enter 0 to hold a day with no loads. Feasible manual loads reserve oven space and forming capacity.</p>
 <div class="scroll"><table class="manual-week-table"><thead><tr><th>Day</th><th>3/4″ carts</th><th>1 1/8″ carts</th><th>Scheduled loads<br>3/4″ / 1 1/8″</th><th>In oven<br>Day end</th><th>Closing sheets<br>3/4″ / 1 1/8″</th><th>Plan status</th></tr></thead><tbody>${dates.map(date=>{
  const r=byDate.get(date),entry=s.manualLoads?.[date],bad=r?.manualPlan?.issues.length;
  return `<tr class="${date===today?'manual-today':''}"><td><strong>${dayLabel(date)}</strong>${date===today?'<small>Today</small>':''}${r?.holiday?'<small>Holiday</small>':r?.closed?'<small>Waterjet off</small>':''}</td>${[['thin','3/4″'],['thick','1 1/8″']].map(([k,label])=>`<td><input type="number" min="0" step="1" inputmode="numeric" aria-label="${date} ${label} carts" data-manual-date="${date}" data-manual-kind="${k}" value="${r?entry?.[k]??'':''}" placeholder="${r?'Auto':'—'}" ${r?'':'disabled'}></td>`).join('')}<td>${r?mixLabel(r.load):'—'}</td><td>${r?`${sum(r.oven)} / ${s.settings.totalCarts}`:'—'}</td><td>${r?mixLabel(r.inv):'—'}</td><td>${!r?'<span class="small">Outside plan dates</span>':bad?`<span class="badge red">Not scheduled</span><small>${r.manualPlan.issues.join(' · ')}</small>`:entry?`<span class="badge green">${sum(r.load)?'Manual':'Manual · no loads'}</span>`:'<span class="badge neutral">Automatic</span>'}</td></tr>`;
 }).join('')}</tbody></table></div>
 <div class="manual-week-actions"><button id="saveManualWeek" class="primary" ${visible.length?'':'disabled'}>Save weekly plan</button><button id="saveManualCalendar" ${visible.length?'':'disabled'}>Save & view cart calendar</button><button id="resetManualWeek" ${locked?'':'disabled'}>Reset this week to auto</button><span id="manualPlanStatus" role="status" class="small">${visible.length?status:'This week is outside the forecast. Adjust the start and end dates in Settings to plan it.'}</span></div></section>`;
}
