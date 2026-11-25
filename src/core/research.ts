import {FIELD_LABELS,type FieldKey} from '../config';
import type {Filter} from './types';
import {filterSignature} from './filters';

export const RESEARCH_TABS=['cases','process','variants','groups','compare','costs','quality','conformance','bottlenecks','rework','patterns'] as const;
export type ResearchTab=typeof RESEARCH_TABS[number];
export const RESEARCH_LABELS:Record<ResearchTab,string>={cases:'Case Explorer',process:'Process Explorer',variants:'Varianten',groups:'Mehrdimensionale Analyse',compare:'Kontrollgruppen & Statistik',costs:'Kostentreiber',quality:'Datenqualität',conformance:'Soll-Ist-Prozess',bottlenecks:'Engpassanalyse',rework:'Wiederholungen',patterns:'Aktivitätsmuster'};
export const RESEARCH_DIMENSIONS=['factory','product_type','delivery_company','warehouse_type','cust_country','delivery_year','cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met','otif_status','factory_product','quantity_deviation_class','credit_block','quantity_change_phase','process_order_quality','process_variant','order_size_class','cust_id','cust_name','quantity_change_group','delivery_month','order_received_month','promised_month'] as const;
export type ResearchDimension=typeof RESEARCH_DIMENSIONS[number];
export const CONTROL_DIMENSIONS=['factory','product_type','warehouse_type','cust_market','order_size_class','delivery_year','credit_block','delivery_company'] as const;
export const EXPOSURES=RESEARCH_DIMENSIONS.filter(d=>!['otif_status','order_tolerance_met','quantity_deviation_class','process_order_quality','process_variant','cust_id','cust_name','cust_addr_code'].includes(d));
export const dimensionName=(d:ResearchDimension)=>d==='order_received_month'?'Auftragseingangsmonat':d==='promised_month'?'Zugesagter Liefermonat':FIELD_LABELS[d];
export function availableResearchDimensions(allowed:FieldKey[]):ResearchDimension[]{return RESEARCH_DIMENSIONS.filter(d=>d==='order_received_month'?allowed.includes('order_received_date'):d==='promised_month'?allowed.includes('promised_date'):allowed.includes(d));}
export type Outcome='otif'|'otd'|'volume';
export const OUTCOMES:Record<Outcome,string>={otif:'OTIF',otd:'On-Time Delivery',volume:'Mengenkonformität'};
export type ResearchSort='cost'|'late'|'short'|'weight'|'key'|'orders';
export const DEFAULT_PROCESS_REFERENCE=['Order received','Confirm sale','Start production','Finished production','Load shipment'];
export const PROCESS_TABS=['process','variants','conformance','bottlenecks','rework','patterns'] as const;
export type PatternState='match'|'no_match'|'unknown';
export type ActivityPattern={kind:'contains'|'missing'|'repeated'|'direct'|'eventually';a:string;b?:string;minOccurrences?:number};
export const PATTERN_LABELS:Record<ActivityPattern['kind'],string>={contains:'Aktivität vorhanden',missing:'Aktivität fehlt',repeated:'Wiederholung',direct:'Direkte Folge (eindeutige Zeitpunkte)',eventually:'Spätere Folge'};
export function patternLabel(p:ActivityPattern){return PATTERN_LABELS[p.kind]+': '+p.a+(p.b?' → '+p.b:p.kind==='repeated'?' (≥ '+(p.minOccurrences||2)+')':'');}
export const validActivityName=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=100;
export function validActivityPattern(value:unknown):value is ActivityPattern{if(!value||typeof value!=='object'||Array.isArray(value))return false;const p=value as ActivityPattern;if(Object.keys(p).some(k=>!['kind','a','b','minOccurrences'].includes(k))||!Object.prototype.hasOwnProperty.call(PATTERN_LABELS,p.kind)||!validActivityName(p.a))return false;return (['direct','eventually'].includes(p.kind)?validActivityName(p.b):p.b===undefined)&&(p.minOccurrences===undefined||p.kind==='repeated'&&Number.isInteger(p.minOccurrences)&&p.minOccurrences>=2&&p.minOccurrences<=10);}
export const validReference=(v:unknown):v is string[]=>Array.isArray(v)&&v.length>=2&&v.length<=8&&new Set(v).size===v.length&&v.every(validActivityName);
export type ResearchSpec={tab:ResearchTab;dimensions?:ResearchDimension[];exposure?:ResearchDimension;a?:string;b?:string;outcome?:Outcome;minN?:number;sequence?:'chronological'|'source';sort?:ResearchSort;status?:string;variant?:string;chronoVariant?:string;pattern?:ActivityPattern;patternState?:PatternState;reference?:string[];referenceState?:PatternState;rankMetric?:'total_days'|'p90_days'|'median_days'|'cases';minCases?:number;rankLimit?:number;reworkSort?:'repeated_cases'|'repeat_events'|'total_cost';pageSize?:10|25|50|100};
export function defaultResearch(tab:ResearchTab='cases'):ResearchSpec{
 if(tab==='groups'||tab==='costs')return {tab,dimensions:[],sort:'cost',pageSize:25};
 if(tab==='compare')return {tab,dimensions:[],outcome:'otif',minN:10};
 if(tab==='process')return {tab,sequence:'chronological'};
 if(tab==='variants')return {tab,sequence:'chronological',sort:'orders',pageSize:25};
 if(tab==='conformance')return {tab,reference:[...DEFAULT_PROCESS_REFERENCE]};
 if(tab==='patterns')return {tab,pattern:{kind:'contains',a:'Change quantity'}};
 if(tab==='rework'||tab==='bottlenecks')return {tab};
 return {tab,sort:'cost',pageSize:25};
}
export function validResearchSpec(value:unknown):value is ResearchSpec{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as ResearchSpec,keys=['tab','dimensions','exposure','a','b','outcome','minN','sequence','sort','status','variant','chronoVariant','pattern','patternState','reference','referenceState','pageSize','rankMetric','minCases','rankLimit','reworkSort'];
 if(Object.keys(v).some(k=>!keys.includes(k))||!RESEARCH_TABS.includes(v.tab))return false;
 if(v.dimensions!==undefined&&(!Array.isArray(v.dimensions)||v.dimensions.length>3||new Set(v.dimensions).size!==v.dimensions.length||!v.dimensions.every(d=>RESEARCH_DIMENSIONS.includes(d))))return false;
 if(v.exposure!==undefined&&!EXPOSURES.includes(v.exposure))return false;
 if(v.tab==='compare'&&(v.dimensions||[]).some(d=>!CONTROL_DIMENSIONS.some(c=>c===d)||d===v.exposure))return false;
 if([v.a,v.b,v.variant].some(s=>s!==undefined&&(typeof s!=='string'||s.length>200||!s.trim())))return false;
 if(v.chronoVariant!==undefined&&(typeof v.chronoVariant!=='string'||! /^[0-9a-f]{32}$/.test(v.chronoVariant)||v.tab!=='cases'))return false;
 if(v.pattern!==undefined&&(!validActivityPattern(v.pattern)||!['patterns','cases'].includes(v.tab))||v.tab==='patterns'&&!v.pattern)return false;
 if(v.reference!==undefined&&(!validReference(v.reference)||!['conformance','cases'].includes(v.tab))||v.pattern&&v.reference)return false;
 if(v.patternState!==undefined&&(!v.pattern||v.tab!=='cases'||!['match','no_match','unknown'].includes(v.patternState))||v.referenceState!==undefined&&(!v.reference||v.tab!=='cases'||!['match','no_match','unknown'].includes(v.referenceState)))return false;
 if(v.tab==='cases'&&(v.pattern&&!v.patternState||v.reference&&!v.referenceState)||v.chronoVariant&&(v.pattern||v.reference)||v.variant&&(v.pattern||v.reference))return false;
 if(v.a!==undefined&&v.b!==undefined&&v.a===v.b)return false;
 if(v.outcome!==undefined&&!Object.prototype.hasOwnProperty.call(OUTCOMES,v.outcome))return false;
 if(v.minN!==undefined&&(!Number.isInteger(v.minN)||v.minN<5||v.minN>1000))return false;
 if(v.sequence!==undefined&&!['chronological','source'].includes(v.sequence))return false;
 if(v.sort!==undefined&&!['cost','late','short','weight','key','orders'].includes(v.sort))return false;
 if(v.status!==undefined&&!['on_time_in_full','on_time_not_full','late_in_full','late_not_full','unknown'].includes(v.status))return false;
 if(v.rankMetric!==undefined&&(v.tab!=='bottlenecks'||!['total_days','p90_days','median_days','cases'].includes(v.rankMetric))||v.minCases!==undefined&&(v.tab!=='bottlenecks'||![1,5,10,20,50,100].includes(v.minCases))||v.rankLimit!==undefined&&(v.tab!=='bottlenecks'||![10,20,50,100,1000].includes(v.rankLimit))||v.reworkSort!==undefined&&(v.tab!=='rework'||!['repeated_cases','repeat_events','total_cost'].includes(v.reworkSort)))return false;
 if(v.pageSize!==undefined&&![10,25,50,100].includes(v.pageSize))return false;
 return true;
}
export function researchQuery(spec:ResearchSpec,page=0,search='',caseKey?:string){
 if(!validResearchSpec(spec))throw Error('Ungültige Analysekonfiguration.');
 const {tab,dimensions,exposure,a,b,sequence,sort,status,variant,chronoVariant,pattern,patternState,reference,referenceState,pageSize}=spec;
 const mode=caseKey?'case':tab==='variants'?(sequence==='chronological'?'variants':'groups'):tab;
 if(mode==='compare'&&(!exposure||!a||!b||a===b))throw Error('Bitte zwei unterschiedliche Gruppen auswählen.');
 return {mode,options:{dimensions:tab==='variants'?['process_variant']:dimensions||[],exposure,a,b,sequence,sort,status,variant,chronoVariant,pattern,patternState,reference,referenceState,pageSize:pageSize||25,page,search,caseKey}};
}
export const researchKey=(filters:Filter[],spec:ResearchSpec,page:number,search:string,caseKey?:string)=>JSON.stringify([filterSignature(filters),researchQuery(spec,page,search,caseKey)]);
export type GroupStats={orders:number;date_n:number;on_time_n:number;volume_n:number;in_full_n:number;otif_n:number;otif_ok:number;late_eligible:number;late_kg_orders:number;late_kg:number;short_eligible:number;short_orders:number;short_kg:number;ordered_kg:number|null;delivered_kg:number|null;late_cost:number;short_cost:number;total_cost:number};
export type GroupRow=GroupStats&{labels:(string|null)[];arm?:'A'|'B';variant_key?:string};
export type CaseRow={case_key:string;factory:string|null;product_type:string|null;cust_id:string|null;cust_name:string|null;cust_country:string|null;ordered_quantity:number|null;delivered_quantity:number|null;delivered_quantity_unit:string|null;promised_date:string|null;delivered_date:string|null;status:string;delay_days:number|null;quantity_change_count:number|null;process_variant:string|null;process_order_quality:string|null;late_cost:number;short_cost:number;total_cost?:number;[key:string]:unknown};
export type EventRow={event_id:number;activity:string;eventtime:string|null;sorting:number|null;anomaly:boolean|null};
export type ActivityRow={activity:string;events:number;cases:number;display_order:number|null};
export type ProcessLink={source:string;target:string;transitions:number;cases:number;valid_duration:number;median_days:number|null;p90_days:number|null;total_days?:number;total_cost?:number;otif_n?:number;otif_ok?:number};
export type ProcessMiningRow=Partial<GroupStats>&{status?:PatternState;activity?:string;rule?:string;events?:number;present_cases?:number;repeated_cases?:number;repeat_events?:number;single_cases?:number;repeated_otif_n?:number;repeated_otif_ok?:number;single_otif_n?:number;single_otif_ok?:number;matched_cases?:number;deviation_cases?:number;unknown_cases?:number;orders:number};
export type QualityInterval={name:string;total:number;present:number;negative:number;valid:number;median_days:number|null;p90_days:number|null};
export type QualityActivity={activity:string;present:number;total:number};
export type ResearchResponse={definitionVersion:string;researchVersion:number;penaltyRate:number;total?:number;rows?:Array<GroupRow|CaseRow|ProcessMiningRow>;baseline?:GroupStats;dimensions?:ResearchDimension[];case?:CaseRow|null;events?:EventRow[]|number;retained?:number;representedCases?:number;cases?:number;activities?:ActivityRow[]|QualityActivity[];links?:ProcessLink[];sequence?:string;checks?:Record<string,number>;intervals?:QualityInterval[];orphanEvents?:number|null;activityNames?:string[];reference?:string[];pattern?:ActivityPattern;rules?:ProcessMiningRow[];eligibleTransitions?:number};
export const ratio=(k:number,n:number)=>Number.isFinite(k)&&Number.isFinite(n)&&n>0?k/n:null;
export const outcomeCount=(r:GroupStats,outcome:Outcome):[number,number]=>outcome==='otif'?[r.otif_ok,r.otif_n]:outcome==='otd'?[r.on_time_n,r.date_n]:[r.in_full_n,r.volume_n];
export function wilson(k:number,n:number):[number,number]|null{
 if(!Number.isInteger(k)||!Number.isInteger(n)||k<0||k>n||n<=0)return null;
 const z=1.95996398454,p=k/n,d=1+z*z/n,m=(p+z*z/(2*n))/d,h=z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)/d;
 return [Math.max(0,m-h),Math.min(1,m+h)];
}
function normalTail(z:number){const t=1/(1+0.2316419*Math.abs(z));return Math.exp(-z*z/2)/Math.sqrt(2*Math.PI)*t*(0.31938153+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));}
export function compareRates(ak:number,an:number,bk:number,bn:number){
 const ciA=wilson(ak,an),ciB=wilson(bk,bn);if(!ciA||!ciB)return null;
 const a=ak/an,b=bk/bn,delta=b-a,p=(ak+bk)/(an+bn),se=Math.sqrt(p*(1-p)*(1/an+1/bn));
 // Newcombe interval for the difference of independent proportions, unadjusted.
 const interval:[number,number]=[Math.max(-1,delta-Math.hypot(b-ciB[0],ciA[1]-a)),Math.min(1,delta+Math.hypot(ciB[1]-b,a-ciA[0]))];
 const sufficient=[an*p,an*(1-p),bn*p,bn*(1-p)].every(n=>n>=5);
 return {a,b,ak,an,bk,bn,ciA,ciB,delta,interval,rateRatio:a>0?b/a:null,pValue:sufficient&&se>0?Math.min(1,2*normalTail(delta/se)):null};
}
export function stratifiedComparison(rows:GroupRow[],outcome:Outcome,minN=10){
 const pairs=new Map<string,{labels:(string|null)[];a?:GroupRow;b?:GroupRow}>();
 let ak=0,an=0,bk=0,bn=0,aCost=0,bCost=0,aOrders=0,bOrders=0;
 for(const row of rows){if(row.arm!=='A'&&row.arm!=='B')continue;const [k,n]=outcomeCount(row,outcome),key=JSON.stringify(row.labels),pair=pairs.get(key)||{labels:row.labels};if(row.arm==='A'){ak+=k;an+=n;aCost+=row.total_cost;aOrders+=row.orders;pair.a=row;}else{bk+=k;bn+=n;bCost+=row.total_cost;bOrders+=row.orders;pair.b=row;}pairs.set(key,pair);}
 const strata=Array.from(pairs.values()).map(pair=>{const [ka,na]=pair.a?outcomeCount(pair.a,outcome):[0,0],[kb,nb]=pair.b?outcomeCount(pair.b,outcome):[0,0];const complete=pair.labels.every(s=>s!==null&&!['Unbekannt','Nicht klassifizierbar'].includes(s));const included=complete&&na>=minN&&nb>=minN;return {...pair,ka,na,kb,nb,included,delta:na&&nb?kb/nb-ka/na:null};});
 const valid=strata.filter(s=>s.included),supportA=valid.reduce((s,r)=>s+r.na,0),supportB=valid.reduce((s,r)=>s+r.nb,0),weight=supportA+supportB;
 const adjustedA=weight?valid.reduce((s,r)=>s+(r.na+r.nb)*(r.ka/r.na),0)/weight:null,adjustedB=weight?valid.reduce((s,r)=>s+(r.na+r.nb)*(r.kb/r.nb),0)/weight:null;
 return {raw:compareRates(ak,an,bk,bn),strata,commonStrata:valid.length,supportA,supportB,coverageA:ratio(supportA,an),coverageB:ratio(supportB,bn),adjustedA,adjustedB,adjustedDelta:adjustedA===null||adjustedB===null?null:adjustedB-adjustedA,aCost,bCost,aOrders,bOrders};
}
export function costFactors(s:GroupStats,rate:number){
 const lf=ratio(s.late_kg_orders,s.late_eligible),lm=ratio(s.late_kg,s.late_kg_orders),sf=ratio(s.short_orders,s.short_eligible),sm=ratio(s.short_kg,s.short_orders);
 return {lateFrequency:lf,lateMass:lm,shortFrequency:sf,shortMass:sm,lateCalculated:s.late_eligible*(lf??0)*(lm??0)*rate,shortCalculated:s.short_eligible*(sf??0)*(sm??0)*rate};
}
