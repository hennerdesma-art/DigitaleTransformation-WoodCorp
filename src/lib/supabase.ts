import {createClient} from '@supabase/supabase-js';
import {PROJECT,type FieldKey} from '../config';
import {toBackend} from '../core/filters';
import type {Filter,Metrics,Ribbon,BreakdownRow,TrendRow,CalculationTemplate,CalculatedMetric} from '../core/types';
import {validateRate} from '../core/calculations';
export type SegmentStats={
 label:string|null;orders:number;otif_cases:number;on_time_not_full_cases:number;
 late_in_full_cases:number;late_not_full_cases:number;unknown_cases:number;late_orders:number;
 otif_rate:number|null;on_time_rate:number|null;volume_rate:number|null;
 late_penalty_eur:number;shortfall_penalty_eur:number;total_penalty_eur:number;
};
export type HeatmapCell={x:string|null;y:string|null;orders:number;otif_rate:number|null;total_penalty_eur:number};
export type DistributionBucket={bucket:string;orders:number;otif_rate:number|null};

export const supabase=createClient(PROJECT.supabaseUrl,PROJECT.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

// A shared request budget protects Postgres from the previous fan-out of multiple
// identical metrics/ribbon calls for every graph node and open dashboard.
const MAX_CONCURRENT=3,MAX_CACHE=160;
const cache=new Map<string,{value:unknown;until:number}>();
const inflight=new Map<string,Promise<unknown>>();
const waiting:Array<()=>void>=[];
let running=0;let cacheGeneration=0;
export function clearAnalyticsCache(){cacheGeneration++;cache.clear();inflight.clear();}
supabase.auth.onAuthStateChange(event=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT'||event==='USER_UPDATED')clearAnalyticsCache()});
async function permit<T>(work:()=>Promise<T>):Promise<T>{
 if(running>=MAX_CONCURRENT)await new Promise<void>(resolve=>waiting.push(resolve));
 running++;
 try{return await work()}
 finally{running--;const next=waiting.shift();next?.()}
}
async function request<T>(name:string,params:Record<string,unknown>={},ttl=90_000):Promise<T>{
 const key=JSON.stringify([name,params]);
 const cached=cache.get(key);
 if(cached&&cached.until>Date.now())return cached.value as T;
 const previous=inflight.get(key);if(previous)return previous as Promise<T>;
 const epoch=cacheGeneration;
 const promise=permit(async()=>{
  const {data,error}=await supabase.rpc(name,params);
  if(error){
   const message=/statement timeout|canceling statement/i.test(error.message)
     ?'Die Datenbankabfrage hat zu lange gedauert. Bitte Filter eingrenzen oder erneut laden.'
     :error.message;
   throw Error(message);
  }
  return data as T;
 }).then(value=>{
  if(epoch===cacheGeneration){
   if(cache.size>=MAX_CACHE)cache.delete(cache.keys().next().value!);
   cache.set(key,{value,until:Date.now()+ttl});
  }
  return value;
 }).finally(()=>{if(inflight.get(key)===promise)inflight.delete(key)});
 inflight.set(key,promise);
 return promise;
}
const normalized=(filters:Filter[])=>({p_filters:toBackend(filters)});
const metrics=(filters:Filter[])=>request<Metrics>('nxt_case_metrics',normalized(filters));
export const analysisApi={
 metrics,
 // The ribbon is the SAME case-grain contract. Do not run a duplicate summary RPC.
 ribbon:async(filters:Filter[]):Promise<Ribbon>=>{
  const m=await metrics(filters);
  return {...m,deliveryDateCount:m.dateCoverage??0} as Ribbon;
 },
 breakdown:(field:FieldKey,filters:Filter[])=>request<BreakdownRow[]>('nxt_breakdown',{p_field:field,...normalized(filters)}),
 trend:(filters:Filter[])=>request<TrendRow[]>('nxt_monthly',normalized(filters)),
 dimensions:()=>request<Record<FieldKey,string[]>>('nxt_dimensions',{},10*60_000),
 calculated:(template:CalculationTemplate,filters:Filter[],rate?:number)=>request<CalculatedMetric>('nxt_calculated_metric',
   {p_template:template,...normalized(filters),p_rate_eur_per_kg:validateRate(template,rate)}),
 segments:(field:FieldKey,filters:Filter[])=>request<SegmentStats[]>('nxt_chart_segments',{p_field:field,...normalized(filters)}),
 heatmap:(x:FieldKey,y:FieldKey,filters:Filter[])=>request<HeatmapCell[]>('nxt_chart_heatmap',{p_x_field:x,p_y_field:y,...normalized(filters)}),
 distribution:(measure:'quantity_change_count'|'lateness_days',filters:Filter[])=>request<DistributionBucket[]>('nxt_chart_distribution',{p_measure:measure,...normalized(filters)}),
};
export async function memberApi(payload:Record<string,unknown>,token?:string){
 const res=await fetch(PROJECT.membersEndpoint,{method:'POST',
  headers:{'Content-Type':'application/json','apikey':PROJECT.publishableKey,...(token?{'Authorization':'Bearer '+token}:{})},
  body:JSON.stringify(payload),cache:'no-store'});
 const d=await res.json();
 if(!res.ok)throw Error(d.error||'Anfrage fehlgeschlagen');return d;
}
