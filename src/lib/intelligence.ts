import {supabase} from './supabase';
import {PROJECT} from '../config';
import type {AssistantContext} from '../core/assistant';
import type {AiPlan,AiRequestIntent} from '../core/assistantProtocol';
export type AiStatus={enabled:boolean;configured?:boolean;forcedDisabled?:boolean;projectEnabled?:boolean;userEnabled?:boolean;provider?:string;model?:string;modelLabel?:string;region?:string;knowledgeVersion:string;graphFormat?:number;researchProtocol?:number;used?:number;limit?:number;projectUsed?:number;projectLimit?:number;remaining?:number;day?:string};
export type AiProjectPolicy={enabled:boolean;defaultLimit:number;projectLimit:number;defaultModel:string;used:number;day:string};
export type AiMemberPolicy={userId:string;role:string;enabled:boolean;enabledOverride:boolean|null;dailyLimit:number|null;bonus:number;modelOverride:string|null;model:string;limit:number;used:number;lastRequest:string|null};
export type AiModel={id:string;label:string;verifiedAt:string|null};
export type AiAdminState={project:AiProjectPolicy;members:AiMemberPolicy[];availableModels:AiModel[];configured:boolean;forcedDisabled:boolean};
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
 adminList:(signal?:AbortSignal)=>request({action:'admin_list'},signal) as Promise<AiAdminState>,
 updateProject:(payload:Pick<AiProjectPolicy,'enabled'|'defaultLimit'|'projectLimit'|'defaultModel'>)=>request({action:'update_project',payload}),
 updateUser:(payload:Pick<AiMemberPolicy,'userId'|'enabledOverride'|'dailyLimit'|'bonus'|'modelOverride'>)=>request({action:'update_user',payload}),
 testModel:(model:string)=>request({action:'test_model',model,consent:true}) as Promise<{ok:boolean;model:string;usage:{inputTokens:number|null;outputTokens:number|null}}>,
 ask:(prompt:string,context:AssistantContext,history:AiMessage[],signal?:AbortSignal,intent:AiRequestIntent='auto')=>request({action:'ask',prompt,context,history,intent,consent:true},signal) as Promise<AiPlan>
};
