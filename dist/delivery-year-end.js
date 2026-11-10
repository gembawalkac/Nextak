export const yearEndDate=start=>`${start.slice(0,4)}-12-31`;

// Separate missed commitments from unfinished year-end work without inventing
// a completion date for missing lead times or a short planning horizon.
export function yearEndOutlook(o,planEnd,cutoff){
 const day='Dec. 31';
 if(!o.inPlan)return {key:'outside',label:'Outside plan',tone:'neutral',reason:'Extend the plan to include this order.'};
 if(o.due>cutoff)return {key:'laterYear',label:'Due next year',tone:'neutral',reason:'Original due date is after this year-end cutoff.'};
 if(o.projected>cutoff||o.ready>cutoff)return {key:'notByYearEnd',label:`Not completed by ${day}`,tone:'red',reason:o.projected?`Projected ready to ship: ${o.projected}.`:`Akro is not fully released until ${o.ready}.`};
 if(!o.ready&&planEnd>=cutoff)return {key:'notByYearEnd',label:`Not completed by ${day}`,tone:'red',reason:'Akro is not fully covered by year end.'};
 if(o.partial)return {key:'yearEndUnknown',label:'Year-end unconfirmed',tone:'amber',reason:'Extend the start date to include the full Akro demand window.'};
 if(o.projected&&o.projected<=cutoff)return o.lateDays>0
  ?{key:'lateByYearEnd',label:`Late · finishes by ${day}`,tone:'amber',reason:'The order misses the current target but is projected ready to ship this year.'}
  :{key:'byYearEnd',label:`Completed by ${day}`,tone:'green',reason:'The order is projected ready to ship by its target this year.'};
 return {key:'yearEndUnknown',label:'Year-end unconfirmed',tone:'amber',reason:!o.ready&&planEnd<cutoff?`Extend the plan through ${cutoff} to assess unfilled orders.`:'Enter remaining downstream lead times to forecast when the order is ready to ship.'};
}
