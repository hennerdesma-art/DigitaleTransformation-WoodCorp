import {supabase} from './supabase';
import {PROJECT} from '../config';
import type {AssistantContext} from '../core/assistant';
import type {AiPlan} from '../core/assistantProtocol';
export type AiStatus={enabled:boolean;configured?:boolean;provider?:string;model?:string;region?:string;knowledgeVersion:string};
export type AiMessage={role:'user'|'assistant';text:string};
async function request(payload:unknown,signal?:AbortSignal){
 const {data,error}=await supabase.auth.getSession();
 if(error||!data.session?.access_token)throw Error('Bitte erneut anmelden.');
 const res=await fetch(PROJECT.supabaseUrl+'/functions/v1/nxt-intelligence',{method:'POST',headers:{'Content-Type':'application/json',apikey:PROJECT.publishableKey,Authorization:'Bearer '+data.session.access_token},body:JSON.stringify(payload),signal,cache:'no-store'});
 let result;try{result=await res.json()}catch{throw Error('KI-Schnittstelle nicht erreichbar.')}
 if(!res.ok)throw Error(typeof result?.error==='string'?result.error:'KI-Anfrage fehlgeschlagen.');
 return result;
}
export const intelligenceApi={
 status:(signal?:AbortSignal)=>request({action:'status'},signal) as Promise<AiStatus>,
 ask:(prompt:string,context:AssistantContext,history:AiMessage[],signal?:AbortSignal)=>request({action:'ask',prompt,context,history,consent:true},signal) as Promise<AiPlan>
};
