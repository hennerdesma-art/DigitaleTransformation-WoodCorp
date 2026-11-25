
type SafeSpec={tab:string;dimensions?:string[];exposure?:string;a?:string;b?:string;outcome?:string;minN?:number;sequence?:string;sort?:string;status?:string;pageSize?:number;[key:string]:unknown};
type Filter={field:string;op:string;value:string|string[]};
type Operation={kind:string;target:string;ref:string|null;widgetType:string|null;value:string|null;field:string|null;label:string|null;widgetId:string|null};
type GraphContext={selectedId:string;nodes:{id:string;containerId?:string|null;localFilters?:Filter[]}[];edges:{source:string;target:string;kind?:string}[];globalFilters?:Filter[];filters:Filter[]};
export const PRIVATE_FIELDS=['cust_id','cust_name','cust_addr_code','customer_product','process_variant'];
const isPrivate=(d:unknown)=>typeof d==='string'&&PRIVATE_FIELDS.includes(d);
const isNum=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const n=(x:unknown)=>isNum(x)?x:0;
const safeNum=(x:unknown)=>isNum(x)?x:null;
const countKeys=['orders','date_n','on_time_n','volume_n','in_full_n','otif_n','otif_ok','late_eligible','late_kg_orders','late_kg','short_eligible','short_orders','short_kg','ordered_kg','delivered_kg','late_cost','short_cost','total_cost'];
const pick=(o:any,keys:string[])=>Object.fromEntries(keys.map(k=>[k,safeNum(o?.[k])]));
const rate=(k:number,d:number)=>d>0?k/d:null;
const round=(x:number|null)=>x===null?null:Math.round(x*10000)/10000;
const percent=(x:number|null)=>x===null?'nicht auswertbar':(100*x).toLocaleString('de-DE',{maximumFractionDigits:2})+' %';
const euro=(x:number)=>x.toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const label=(v:unknown)=>typeof v==='string'?v.slice(0,400):null;
export function researchRequest(spec:SafeSpec){
 if(spec.tab==='cases'||spec.dimensions?.some(isPrivate)||isPrivate(spec.exposure))return null;
 if(!['groups','costs','compare','process','variants','quality','conformance','bottlenecks','rework','patterns'].includes(spec.tab))return null;
 const {tab,...rest}=spec;
 const mode=tab==='variants'&&spec.sequence==='source'?'groups':tab==='variants'?'variants':tab;
 return {mode,options:{...rest,dimensions:tab==='variants'?['process_variant']:spec.dimensions||[],pageSize:25,page:0,sort:spec.sort||'cost',sequence:spec.sequence||'chronological'}};
}
export function suggestedResearch(prompt:string,fields:string[],selected:SafeSpec[]=[],segments:Record<string,unknown>={}):SafeSpec[]{
 const p=prompt.toLowerCase(),out:SafeSpec[]=[],add=(s:SafeSpec)=>{if(out.length<3&&researchRequest(s)&&!out.some(x=>JSON.stringify(x)===JSON.stringify(s)))out.push(s)};
 for(const s of selected)add(s);
 const have=(d:string)=>fields.includes(d);
 const dims=['factory','product_type'].filter(have);
 const getLabels=(d:string)=>Array.isArray(segments[d])?(segments[d] as any[]).flatMap(r=>typeof r.label==='string'?[r.label]:[]):[];
 if(/mengenänder|quantity change/.test(p)&&have('quantity_change_group')){
  const values=getLabels('quantity_change_group'),b=/3\+|drei|mindestens 3/.test(p)?'3+':/\b2 mengenänder/.test(p)?'2':'1';
  if(values.includes('0')&&values.includes(b))add({tab:'compare',exposure:'quantity_change_group',a:'0',b,dimensions:['factory','product_type','order_size_class'].filter(have),outcome:/termin|otd|pünktlich/.test(p)&&!/mengenkonform/.test(p)?'otd':/mengenkonform|quantity|menge/.test(p)?'volume':'otif',minN:10});
 }
 if(/kosten|strafe|cost|penalt|wirtschaft|business case/.test(p)){const d=/kundenmarkt|market/.test(p)&&have('cust_market')?['cust_market','product_type'].filter(have):/kundenland|country/.test(p)&&have('cust_country')?['cust_country','product_type'].filter(have):dims;add({tab:'costs',dimensions:d});}
 if(/konformität|conformance|soll.?ist|sollprozess/.test(p)&&!/mengenkonform/.test(p))add({tab:'conformance'});
 if(/engpass|bottleneck|wartezeit|waiting/.test(p))add({tab:'bottlenecks'});
 if(/rework|wiederhol|nacharbeit|schleif/.test(p))add({tab:'rework'});
 if(/variant/.test(p))add({tab:'variants',sequence:'chronological',sort:'orders'});
 if(/datenqualität|data quality|zeitstempel|plausib/.test(p))add({tab:'quality'});
 if(/prozess|process|durchlauf|transport|produktion/.test(p))add({tab:'process',sequence:'chronological'});
 if(/ursach|root cause|thinking.?path|analysepfad|vergleich|analyse|analysebaum/.test(p))add({tab:'groups',dimensions:dims});
 return out;
}
/** Aggregate output is constructed by allowlist, never spread from RPC data. */
export function sanitizeResearch(result:any,spec:SafeSpec){
 if(!result||typeof result!=='object')return {status:'unavailable'};
 if(!researchRequest(spec))return {status:'private_browser_only'};
 const base=result.baseline;
 if(base&&n(base.orders)<5||typeof result.cases==='number'&&result.cases<5||result.checks&&n(result.checks.orders)<5)return {status:'suppressed'};
 const meta={status:'available',tab:spec.tab,definitionVersion:label(result.definitionVersion),scope:'exact filters for this query; compare only within this context'};
 if(spec.tab==='compare'){
  const rows=Array.isArray(result.rows)?result.rows:[],by=new Map<string,{a?:any;b?:any}>();
  let ak=0,an=0,bk=0,bn=0,ac=0,bc=0;
  const [okKey,nKey]=spec.outcome==='otd'?['on_time_n','date_n']:spec.outcome==='volume'?['in_full_n','volume_n']:['otif_ok','otif_n'];
  for(const row of rows){if(row.arm!=='A'&&row.arm!=='B')continue;const k=n(row[okKey]),den=n(row[nKey]);const key=JSON.stringify(row.labels),pair=by.get(key)||{};if(row.arm==='A'){ak+=k;an+=den;ac+=n(row.total_cost);pair.a=row;}else{bk+=k;bn+=den;bc+=n(row.total_cost);pair.b=row;}by.set(key,pair);}
  if(an<5||bn<5)return {status:'suppressed',tab:spec.tab};
  let sa=0,sb=0,wa=0,wb=0,common=0;const strata:any[]=[];
  for(const [key,{a,b}] of by){const labels=JSON.parse(key),na=n(a?.[nKey]),nb=n(b?.[nKey]),ka=n(a?.[okKey]),kb=n(b?.[okKey]);if(!Array.isArray(labels)||labels.some((x:unknown)=>x===null||['Unbekannt','Nicht klassifizierbar'].includes(String(x)))||na<Math.max(5,spec.minN||10)||nb<Math.max(5,spec.minN||10))continue;const w=na+nb;sa+=na;sb+=nb;wa+=w*ka/na;wb+=w*kb/nb;common++;strata.push({labels:labels.map(label),aN:na,bN:nb,aRate:round(ka/na),bRate:round(kb/nb)});}
  const w=sa+sb,adjustedA=w?wa/w:null,adjustedB=w?wb/w:null;
  return {...meta,outcome:spec.outcome||'otif',exposure:spec.exposure,a:spec.a,b:spec.b,controls:spec.dimensions||[],raw:{aN:an,bN:bn,aRate:round(ak/an),bRate:round(bk/bn),delta:round(bk/bn-ak/an),aCost:ac,bCost:bc},standardized:{aRate:round(adjustedA),bRate:round(adjustedB),delta:round(wb===0&&wa===0&&!w?null:w?(wb-wa)/w:null),commonStrata:common,coverageA:round(rate(sa,an)),coverageB:round(rate(sb,bn))},strata:strata.sort((a,b)=>b.aN+b.bN-a.aN-a.bN).slice(0,10),method:'Pooled valid-case weights in common supported strata; observational, no adjusted significance claim.'};
 }
 if(spec.tab==='process'||spec.tab==='bottlenecks'){
  const links=Array.isArray(result.links)?result.links.filter((l:any)=>n(l.cases)>=5):[];
  const ordered=[...links].sort((a,b)=>spec.tab==='bottlenecks'?n(b.p90_days)-n(a.p90_days):n(b.transitions)-n(a.transitions));
  return {...meta,cases:safeNum(result.cases),events:safeNum(result.events),retained:safeNum(result.retained),sequence:label(result.sequence),activities:(Array.isArray(result.activities)?result.activities:[]).filter((a:any)=>n(a.cases)>=5).slice(0,30).map((a:any)=>({activity:label(a.activity),cases:safeNum(a.cases),events:safeNum(a.events)})),links:ordered.slice(0,15).map((l:any)=>({source:label(l.source),target:label(l.target),cases:safeNum(l.cases),transitions:safeNum(l.transitions),valid_duration:safeNum(l.valid_duration),median_days:n(l.valid_duration)>=5?safeNum(l.median_days):null,p90_days:n(l.valid_duration)>=5?safeNum(l.p90_days):null,total_days:n(l.valid_duration)>=5?safeNum(l.total_days):null})),method:'Timestamp ties and ambiguous endpoints are excluded from timing statistics; elapsed transition time is not measured waiting time.'};
 }
 if(spec.tab==='quality'){
  const q=result.checks||{},keys=['orders','distinct_keys','events','missing_events','missing_features','missing_intervals','missing_dates','missing_tolerance','other_units','missing_quantity','negative_quantity','date_flag_checked','date_flag_mismatch','tolerance_checked','tolerance_mismatch','alternate_quantity_checked','alternate_quantity_mismatch','bad_time_cases','bad_time_events','tied_cases','tied_events','gd_actual_n','gd_actual_match','gd_promise_n','gd_promise_match','chronological_plausible'];
  return {...meta,checks:pick(q,keys),intervals:(Array.isArray(result.intervals)?result.intervals:[]).slice(0,10).map((i:any)=>({name:label(i.name),...pick(i,['total','present','negative','valid']),median_days:n(i.valid)>=5?safeNum(i.median_days):null,p90_days:n(i.valid)>=5?safeNum(i.p90_days):null}))};
 }
 if(['conformance','rework','patterns'].includes(spec.tab)){
  if(n(result.cases)<5)return {status:'suppressed',tab:spec.tab};
  return {...meta,cases:safeNum(result.cases),reference:Array.isArray(result.reference)?result.reference.map(label):undefined,pattern:result.pattern&&typeof result.pattern==='object'?{kind:label(result.pattern.kind),a:label(result.pattern.a),b:label(result.pattern.b)}:undefined,rows:(Array.isArray(result.rows)?result.rows:[]).filter((r:any)=>n(r.orders)>=5&&(spec.tab!=='rework'||n(r.present_cases)>=5)).slice(0,20).map((r:any)=>({label:label(r.label),activity:label(r.activity),rule:label(r.rule),status:label(r.status),...pick(r,countKeys),events:safeNum(r.events),present_cases:safeNum(r.present_cases),repeated_cases:n(r.repeated_cases)>=5?safeNum(r.repeated_cases):null,repeat_events:n(r.repeated_cases)>=5?safeNum(r.repeat_events):null,repeated_otif_n:n(r.repeated_otif_n)>=5?safeNum(r.repeated_otif_n):null,repeated_otif_ok:n(r.repeated_otif_n)>=5?safeNum(r.repeated_otif_ok):null,single_otif_n:n(r.single_otif_n)>=5?safeNum(r.single_otif_n):null,single_otif_ok:n(r.single_otif_n)>=5?safeNum(r.single_otif_ok):null,total_cost:spec.tab==='rework'&&n(r.repeated_cases)<5?null:safeNum(r.total_cost)})),rules:(Array.isArray(result.rules)?result.rules:[]).map((r:any)=>({rule:label(r.rule),...pick(r,['orders','matched_cases','deviation_cases','unknown_cases'])})),baseline:base?pick(base,countKeys):undefined,method:'Proposed reference or observed activity pattern; not a verified corporate standard or causal attribution.'};
 }
 const rows=Array.isArray(result.rows)?result.rows.filter((r:any)=>n(r.orders)>=5):[];
 return {...meta,baseline:base?pick(base,countKeys):undefined,totalGroups:safeNum(result.total),dimensions:spec.dimensions||[],rows:rows.slice(0,12).map((r:any)=>({labels:Array.isArray(r.labels)?r.labels.map(label):[],...pick(r,countKeys)})),method:'Top groups only, at least five orders per displayed group; no row-level records.'};
}
const key=(f:Filter)=>JSON.stringify([f.field,f.op,f.value]);
const uniq=(fs:Filter[])=>[...new Map(fs.map(f=>[key(f),f])).values()];
const same=(a:Filter[],b:Filter[])=>JSON.stringify(a.map(key).sort())===JSON.stringify(b.map(key).sort());
export function plannedResearchChecks(context:GraphContext,operations:Operation[],parse:(value:string|null)=>SafeSpec){
 const nodes=new Map(context.nodes.map(n=>[n.id,{parents:[] as string[],filters:[...(n.localFilters||[])]}]));
 for(const e of context.edges)if(e.kind!=='annotation'&&nodes.has(e.source)&&nodes.has(e.target))nodes.get(e.target)!.parents.push(e.source);
 for(const n of context.nodes)if(n.containerId&&nodes.has(n.containerId))nodes.get(n.id)!.parents.push(n.containerId);
 const scope=(id:string)=>{const seen=new Set<string>(),active=new Set<string>(),result=[...(context.globalFilters||[])];function visit(x:string){if(active.has(x))throw Error('cycle');if(seen.has(x))return;const n=nodes.get(x);if(!n)throw Error('missing');active.add(x);for(const p of n.parents)visit(p);result.push(...n.filters);active.delete(x);seen.add(x)}visit(id);return uniq(result);};
 try{if(!same(scope(context.selectedId),context.filters))return [];}catch{return [];}
 const checks:{target:string;label:string;spec:SafeSpec;filters:Filter[]}[]=[];
 const planned:{target:string;label:string;spec:SafeSpec}[]=[];
 for(const op of operations){
  if((op.kind==='add_branch'||op.kind==='add_container')&&op.ref){const standalone=op.kind==='add_branch'?op.field==='standalone':op.value==='standalone';nodes.set(op.ref,{parents:standalone?[]:[op.target],filters:[]});}
  if(op.kind==='add_filter'&&op.field&&op.value&&nodes.has(op.target)){let value:string|string[]=op.value;const operator=op.widgetType||'eq';if(operator==='between'||operator==='in'){try{value=JSON.parse(op.value)}catch{continue}}nodes.get(op.target)!.filters.push({field:op.field,op:operator,value});}
  if(op.widgetType==='research'&&['add_branch','add_widget','set_node_visualization','configure_widget'].includes(op.kind)){try{const spec=parse(op.value);if(researchRequest(spec))planned.push({target:op.kind==='add_branch'?op.ref!:op.target,label:op.label||spec.tab,spec})}catch{/* validator handles invalid spec */}}
 }
 for(const p of planned){if(checks.length>=4)break;try{const filters=scope(p.target);if(filters.length<=12)checks.push({...p,filters})}catch{/* invalid context cannot be claimed checked */}}
 return checks;
}
export function evidenceSummary(e:any):string{
 if(e.status!=='available')return 'Keine auswertbare, freigegebene Aggregation.';
 if(e.tab==='compare'){const r=e.raw,s=e.standardized;return 'A '+e.a+': '+percent(r.aRate)+' (n='+r.aN+'), B '+e.b+': '+percent(r.bRate)+' (n='+r.bN+'); standardisierte Differenz '+(s.delta===null?'nicht auswertbar':(s.delta*100).toLocaleString('de-DE',{maximumFractionDigits:2})+' pp')+'; gemeinsame Schichten '+s.commonStrata+', Abdeckung A/B '+percent(s.coverageA)+' / '+percent(s.coverageB)+'. Kein Kausalitätsnachweis.';}
 if(e.tab==='quality'){const q=e.checks;return q.orders+' Aufträge, '+q.events+' Ereignisse; '+q.tied_cases+' Aufträge mit zeitgleichen Ereignissen, '+q.missing_dates+' fehlende Terminangaben; Goods delivered stimmt bei '+q.gd_actual_match+' von '+q.gd_actual_n+' bewertbaren Events mit dem tatsächlichen Liefertag überein.';}
 if(e.tab==='process'||e.tab==='bottlenecks')return e.cases+' Aufträge, '+e.retained+' von '+e.events+' Ereignissen berücksichtigt; '+e.links.length+' relevante Übergänge in der Ergebnisübersicht. Dauerstatistik nur für zeitlich eindeutige Übergänge.';
 if(e.tab==='conformance'||e.tab==='patterns')return e.cases+' Aufträge; '+e.rows.map((r:any)=>(r.status==='match'?'Erfüllt':r.status==='no_match'?'Nicht erfüllt':'Nicht bewertbar')+': '+r.orders).join(', ')+'. '+(e.tab==='conformance'?'Referenz ist eine Prüfannahme.':'Muster ist eine beobachtete Aktivitätsregel.');
 if(e.tab==='rework')return e.cases+' Aufträge; '+e.rows.filter((r:any)=>r.repeated_cases!==null).slice(0,3).map((r:any)=>r.activity+': '+r.repeated_cases+' Aufträge mit Wiederholung').join('; ')+'. Keine automatische Nacharbeits- oder Ursachenbewertung.';
 if(e.baseline)return e.baseline.orders+' Aufträge, OTIF '+percent(rate(e.baseline.otif_ok,e.baseline.otif_n))+', OTD '+percent(rate(e.baseline.on_time_n,e.baseline.date_n))+', modellierte Gesamtkosten '+euro(e.baseline.total_cost)+'.'+(e.totalGroups!==undefined?' '+e.totalGroups+' Gruppen.':'');
 return (e.cases??'–')+' Aufträge im abgefragten Kontext; '+(e.rows?.length??0)+' freigegebene Ergebnisgruppen. Kein Kausalitätsnachweis.';
}
