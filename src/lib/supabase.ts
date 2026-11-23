import {createClient} from '@supabase/supabase-js';
import {PROJECT,type FieldKey} from '../config';
import {toBackend} from '../core/filters';
import type {Filter,Metrics,Ribbon,BreakdownRow,TrendRow,CalculationTemplate,CalculatedMetric} from '../core/types';
import {validateRate} from '../core/calculations';
export const supabase=createClient(PROJECT.supabaseUrl,PROJECT.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
async function rpc<T>(name:string,params:Record<string,unknown>={}):Promise<T>{const {data,error}=await supabase.rpc(name,params);if(error)throw Error(error.message);return data as T;}
const normalized=(f:Filter[])=>({p_filters:toBackend(f)});
export const analysisApi={
 metrics:(f:Filter[])=>rpc<Metrics>('nxt_case_metrics',normalized(f)),
 ribbon:(f:Filter[])=>rpc<Ribbon>('nxt_ribbon_kpis',normalized(f)),
 breakdown:(field:FieldKey,f:Filter[])=>rpc<BreakdownRow[]>('nxt_breakdown',{p_field:field,...normalized(f)}),
 trend:(f:Filter[])=>rpc<TrendRow[]>('nxt_monthly',normalized(f)),
 dimensions:()=>rpc<Record<FieldKey,string[]>>('nxt_dimensions'),
 calculated:(template:CalculationTemplate,filters:Filter[],rate?:number)=>rpc<CalculatedMetric>('nxt_calculated_metric',{p_template:template,...normalized(filters),p_rate_eur_per_kg:validateRate(template,rate)}),
};
export async function memberApi(payload:Record<string,unknown>,token?:string){
 const res=await fetch(PROJECT.membersEndpoint,{method:'POST',headers:{'Content-Type':'application/json','apikey':PROJECT.publishableKey,...(token?{'Authorization':'Bearer '+token}:{})},body:JSON.stringify(payload)});
 const d=await res.json();if(!res.ok)throw Error(d.error||'Anfrage fehlgeschlagen');return d;
}
