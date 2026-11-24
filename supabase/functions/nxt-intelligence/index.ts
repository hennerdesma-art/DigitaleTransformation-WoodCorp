import {createClient} from "npm:@supabase/supabase-js@2.119.0";
import {PLAN_SCHEMA,validatePlan,KNOWLEDGE_VERSION,AI_DIMENSIONS} from "./protocol.ts";
import {MASTER_PLAYBOOK} from "./knowledge.ts";
import {bedrockConfig,requestBedrock,BedrockError,BEDROCK_MODEL,BEDROCK_REGION} from "./bedrock.ts";
const url=Deno.env.get("SUPABASE_URL")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(["https://hennerdesma-art.github.io","http://localhost:5173","http://127.0.0.1:5173"]);
const response=(body:unknown,code:number,origin:string)=>new Response(code===204?null:JSON.stringify(body),{status:code,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":origins.has(origin)?origin:"https://hennerdesma-art.github.io","access-control-allow-headers":"authorization, apikey, content-type, x-client-info","access-control-allow-methods":"POST, OPTIONS","cache-control":"no-store","vary":"Origin"}});
const config=()=>bedrockConfig(name=>Deno.env.get(name));
const enabled=()=>Deno.env.get("NXT_AI_ENABLED")==="true"&&!!config();
const isString=(x:unknown,max:number)=>typeof x==="string"&&x.length<=max&&x.trim().length>0;
const safeNumber=(x:unknown)=>typeof x==="number"&&Number.isFinite(x)?x:null;
const safeFields=new Set([...AI_DIMENSIONS,"delivered_date","promised_date","ordered_quantity","delivered_quantity","order_value","days_to_del_deadline","quantity_change_count","delivery_date_change_count","production_start_change_count","price_change_count","anomalous_event_count"]);
const cleanText=(x:unknown,max:number)=>typeof x==="string"?x.slice(0,max):null;
Deno.serve(async(req)=>{
 const origin=req.headers.get("origin")||"";
 if(req.method==="OPTIONS")return response({},204,origin);
 if(req.method!=="POST")return response({error:"Methode nicht erlaubt."},405,origin);
 if(origin&&!origins.has(origin))return response({error:"Origin nicht erlaubt."},403,origin);
 try{
  const bearer=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if(!bearer)return response({error:"Anmeldung erforderlich."},401,origin);
  const {data:auth,error:authError}=await admin.auth.getUser(bearer);
  if(authError||!auth.user)return response({error:"Ungültige Sitzung."},401,origin);
  const {data:member,error:memberError}=await admin.from("woodcorp_access").select("role").eq("user_id",auth.user.id).maybeSingle();
  if(memberError||!member||!["viewer","analyst","admin"].includes(member.role))return response({error:"Kein Zugriff auf NXT Analytics."},403,origin);
  if(Number(req.headers.get("content-length")||0)>200000)return response({error:"Anfrage zu groß."},413,origin);
  const raw=await req.text();if(new TextEncoder().encode(raw).length>200000)return response({error:"Anfrage zu groß."},413,origin);
  let body:any;try{body=JSON.parse(raw)}catch{return response({error:"Ungültiges JSON."},400,origin)}
  if(body?.action==="status")return response({enabled:enabled(),configured:!!config(),provider:"Amazon Bedrock",model:BEDROCK_MODEL,region:BEDROCK_REGION,knowledgeVersion:KNOWLEDGE_VERSION},200,origin);
  if(body?.action!=="ask"||body.consent!==true||!isString(body.prompt,1600))return response({error:"Ungültige Anfrage oder fehlende Freigabe."},400,origin);
  const provider=config();
  if(!enabled()||!provider)return response({error:"Amazon Bedrock noch nicht aktiviert oder unvollständig konfiguriert. Lokale Vorlagen sind verfügbar."},503,origin);
  const context=body.context;
  if(!context||!isString(context.selectedId,180)||!Array.isArray(context.nodes)||context.nodes.length>300||!Array.isArray(context.edges)||context.edges.length>400||!Array.isArray(context.filters)||context.filters.length>12||!Array.isArray(context.allowedFields))return response({error:"Workspace-Kontext ungültig."},400,origin);
  const client=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  let canEdit=member.role!=="viewer",workspaceTitle="Lokaler Entwurf";
  if(context.workspaceId!==null){
   if(!isString(context.workspaceId,36)||!Number.isInteger(context.revision))return response({error:"Workspace-ID oder Revision ungültig."},400,origin);
   const {data:ws,error}=await client.from("nxt_workspaces").select("id,title,owner_id,revision").eq("id",context.workspaceId).maybeSingle();
   if(error||!ws)return response({error:"Workspace nicht zugänglich."},403,origin);
   if(ws.revision!==context.revision)return response({error:"Workspace wurde zwischenzeitlich gespeichert. Bitte neu laden."},409,origin);
   workspaceTitle=ws.title;canEdit=canEdit&&(member.role==="admin"||ws.owner_id===auth.user.id);
  }
  const {data:catalog,error:catalogError}=await client.from("nxt_filter_catalog").select("field_key").eq("enabled",true);
  if(catalogError||!catalog)return response({error:"Filterkatalog nicht verfügbar."},503,origin);
  const fields=catalog.map(x=>x.field_key).filter(x=>safeFields.has(x)&&context.allowedFields.includes(x));
  // Validate and minimize context. Selected node and IDs are logical references, never executable SQL.
  const nodes=context.nodes.map((n:any)=>{
   if(!n||!isString(n.id,180)||!isString(n.label,100)||!["root","segment","metric","note","condition","container"].includes(n.kind)||!Array.isArray(n.widgets)||n.widgets.length>24)throw Error("Ungültiger Knoten.");
   return {id:n.id,label:n.label,kind:n.kind,metric:cleanText(n.metric,50),visualization:cleanText(n.visualization,40),containerId:cleanText(n.containerId,180),description:cleanText(n.description,240),question:cleanText(n.question,700),widgets:n.widgets.map((w:any)=>({id:cleanText(w?.id,120),type:cleanText(w?.type,40),title:cleanText(w?.title,100),metric:cleanText(w?.metric,50),dimension:cleanText(w?.dimension,50),compareDimension:cleanText(w?.compareDimension,50)}))};
  });
  const ids=nodes.map((n:any)=>n.id);if(new Set(ids).size!==ids.length||!ids.includes(context.selectedId))return response({error:"Ausgewählter Knoten nicht vorhanden."},400,origin);
  const edges=context.edges.map((e:any)=>({source:e?.source,target:e?.target})).filter((e:any)=>ids.includes(e.source)&&ids.includes(e.target));
  const filters=context.filters.map((f:any)=>{
   if(!f||!isString(f.field,60)||!["eq","in","between","gte","lte"].includes(f.op))throw Error("Ungültiger Filter.");
   const valid=typeof f.value==="string"?isString(f.value,200):Array.isArray(f.value)&&f.value.length>0&&f.value.length<=20&&f.value.every((v:unknown)=>isString(v,200));
   if(!valid)throw Error("Ungültiger Filterwert.");
   return {field:f.field,op:f.op,value:f.value};
  });
  // Charge a single atomic server-side allowance BEFORE calling the model. Fail closed.
  const {data:reserved,error:limitError}=await admin.rpc("nxt_ai_reserve_request",{p_user:auth.user.id});
  if(limitError||reserved!==true)return response({error:limitError?"KI-Kontingent nicht verfügbar.":"KI-Limit erreicht. Bitte später erneut versuchen."},limitError?503:429,origin);
  const metricsResult=await client.rpc("nxt_case_metrics",{p_filters:filters});
  if(metricsResult.error)return response({error:"Der aktuelle Filterkontext konnte nicht berechnet werden."},400,origin);
  const m=metricsResult.data;
  const metricKeys=["orders","otifRate","onTimeRate","volumeConformanceRate","otifCases","dateCoverage","volumeCoverage","otifCoverage","lateOrders","avgDelayDays","totalPenaltyEur","latePenaltyEur","shortfallPenaltyEur","kgEligibleCases","kgExcludedCases","unclassifiedCases"];
  const evidence:Record<string,unknown>={source:"nxt_case_metrics",scope:"selected node effective filters",metrics:m?.orders>=5?Object.fromEntries(metricKeys.map(k=>[k,safeNumber(m?.[k])])):{suppressed:"Weniger als fünf Aufträge oder keine Daten."}};
  if(m?.orders>=5){
   const dims=["factory","product_type","delivery_company"].filter(x=>fields.includes(x));
   const results=await Promise.allSettled(dims.map(p_field=>client.rpc("nxt_chart_segments",{p_field,p_filters:filters})));
   evidence.segments=Object.fromEntries(results.map((r,i)=>{
    if(r.status!=="fulfilled"||r.value.error||!Array.isArray(r.value.data))return [dims[i],{unavailable:true}];
    const rows=r.value.data.filter((x:any)=>x.orders>=5).sort((a:any,b:any)=>Number(b.total_penalty_eur||0)-Number(a.total_penalty_eur||0)).slice(0,12).map((x:any)=>({label:cleanText(x.label,100),orders:safeNumber(x.orders),otif_rate:safeNumber(x.otif_rate),on_time_rate:safeNumber(x.on_time_rate),volume_rate:safeNumber(x.volume_rate),total_penalty_eur:safeNumber(x.total_penalty_eur)}));
    return [dims[i],rows];
   }));
   if(/prozess|interval|bottleneck|durchlauf|produktion|root cause|ursach/i.test(body.prompt)){
    const p=await client.rpc("nxt_e02_interval_summary",{p_filters:filters});
    if(!p.error&&Array.isArray(p.data?.intervals))evidence.processIntervals=p.data.intervals.slice(0,5).map((x:any)=>({key:x.key,validCases:x.validCases,missingCases:x.missingCases,negativeCases:x.negativeCases,medianDays:x.validCases>=5?x.medianDays:null,p90Days:x.validCases>=5?x.p90Days:null,otifValidCases:x.otifValidCases,nonOtifValidCases:x.nonOtifValidCases,otifMedianDays:x.otifValidCases>=5?x.otifMedianDays:null,nonOtifMedianDays:x.nonOtifValidCases>=5?x.nonOtifMedianDays:null}));
   }
  }
  const history=Array.isArray(body.history)?body.history.slice(-8).filter((x:any)=>["user","assistant"].includes(x?.role)&&isString(x.text,1600)).map((x:any)=>({role:x.role,text:x.text})):[];
  const modelContext={workspaceTitle,selectedId:context.selectedId,nodes,edges,canEdit,allowedFields:fields,filters:filters.map((f:any)=>safeFields.has(f.field)?f:{field:f.field,op:f.op,value:"[nicht übertragen]"}),evidence,history,question:body.prompt};
  const {plan:parsed}=await requestBedrock(provider,MASTER_PLAYBOOK,modelContext,PLAN_SCHEMA);
  const plan=validatePlan(parsed,ids,fields,canEdit);
  return response(plan,200,origin);
 }catch(e){if(e instanceof BedrockError)return response({error:e.message},e.status,origin);return response({error:e instanceof Error&&/Ungültig|Unbekannt|Dimension|Zielwert|Filter|Widget|Knoten|lesbar|Kennzahl/.test(e.message)?e.message:"Die Anfrage konnte nicht sicher verarbeitet werden."},400,origin)}
});
