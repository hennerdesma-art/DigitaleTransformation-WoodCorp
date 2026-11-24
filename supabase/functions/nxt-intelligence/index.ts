import {createClient} from "npm:@supabase/supabase-js@2.119.0";
import {PLAN_SCHEMA,validatePlan,KNOWLEDGE_VERSION,AI_DIMENSIONS,AI_METRICS,AI_WIDGET_TYPES,AI_CANVAS_TYPES,AI_INTERVAL_KEYS} from "./protocol.ts";
import {MASTER_PLAYBOOK} from "./knowledge.ts";
import {bedrockConfig,requestBedrock,BedrockError,BEDROCK_MODEL,BEDROCK_REGION,BEDROCK_MODELS,MODEL_LABELS,validModel} from "./bedrock.ts";
const url=Deno.env.get("SUPABASE_URL")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=new Set(["https://hennerdesma-art.github.io","http://localhost:5173","http://127.0.0.1:5173"]);
const response=(body:unknown,code:number,origin:string)=>new Response(code===204?null:JSON.stringify(body),{status:code,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":origins.has(origin)?origin:"https://hennerdesma-art.github.io","access-control-allow-headers":"authorization, apikey, content-type, x-client-info","access-control-allow-methods":"POST, OPTIONS","cache-control":"no-store","vary":"Origin"}});
const config=(model=BEDROCK_MODEL)=>bedrockConfig(name=>Deno.env.get(name),model);
// Project and per-user switches live in protected database policy. Optional emergency override remains server-only.
const forceDisabled=()=>Deno.env.get("NXT_AI_FORCE_DISABLED")==="true";
const policy=async(actor:string,action:string,payload:Record<string,unknown>={})=>{const r=await admin.rpc("nxt_ai_control",{p_actor:actor,p_action:action,p_payload:payload});if(r.error||!r.data)throw Error("KI-Verwaltung nicht verfügbar.");return r.data};
const policyError=(reason:string)=>({membership:"Kein Projektzugang.",admin_required:"Nur Administratoren dürfen KI-Zugänge verwalten.",disabled:"KI-Zugang ist deaktiviert.",quota:"Tageskontingent erreicht.",cooldown:"Bitte fünf Sekunden zwischen KI-Anfragen einhalten.",invalid_model:"Modell nicht freigegeben.",invalid_project:"Ungültige Projekteinstellungen.",invalid_user:"Ungültige Nutzerkonfiguration.",member_missing:"Mitglied nicht mehr vorhanden."} as Record<string,string>)[reason]||"KI-Konfiguration konnte nicht geprüft werden.";
const isString=(x:unknown,max:number)=>typeof x==="string"&&x.length<=max&&x.trim().length>0;
const safeNumber=(x:unknown)=>typeof x==="number"&&Number.isFinite(x)?x:null;
const safeFields=new Set([...AI_DIMENSIONS,"delivered_date","promised_date","ordered_quantity","delivered_quantity","order_value","days_to_del_deadline","quantity_change_count","delivery_date_change_count","production_start_change_count","price_change_count","anomalous_event_count"]);
const cleanText=(x:unknown,max:number)=>typeof x==="string"?x.slice(0,max):null;
const modelFilters=(value:unknown)=>Array.isArray(value)?value.slice(0,12).flatMap((f:any)=>{if(!f||!safeFields.has(f.field)||!["eq","in","between","gte","lte"].includes(f.op))return [];const v=f.value;if(typeof v==="string"&&v.length<=200)return [{field:f.field,op:f.op,value:v}];if(Array.isArray(v)&&v.length<=20&&v.every(x=>typeof x==="string"&&x.length<=200))return [{field:f.field,op:f.op,value:v}];return []}):[];
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
  if(body?.action==="status"){
   const p=await policy(auth.user.id,"status");
   if(!p.allowed)return response({error:policyError(p.reason)},403,origin);
   return response({...p,enabled:p.projectEnabled&&p.userEnabled&&!forceDisabled()&&!!config(p.model),configured:!!config(p.model),forcedDisabled:forceDisabled(),provider:"Amazon Bedrock",modelLabel:MODEL_LABELS[p.model],region:BEDROCK_REGION,knowledgeVersion:KNOWLEDGE_VERSION},200,origin);
  }
  if(["admin_list","update_project","update_user","test_model"].includes(body?.action)){
   if(member.role!=="admin")return response({error:"Nur Administratoren."},403,origin);
   if(body.action==="admin_list"){
    const p=await policy(auth.user.id,"admin_list");
    if(!p.allowed)return response({error:policyError(p.reason)},403,origin);
    return response({...p,configured:!!config(),forcedDisabled:forceDisabled(),availableModels:BEDROCK_MODELS.map(id=>({id,label:MODEL_LABELS[id],verifiedAt:p.models.find((m:any)=>m.id===id)?.verifiedAt||null}))},200,origin);
   }
   if(body.action==="update_project"||body.action==="update_user"){
    const p=body.payload;
    if(!p||typeof p!=="object")return response({error:"Ungültige Einstellungen."},400,origin);
    const integer=(v:unknown,min:number,max:number)=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=max;
    if(body.action==="update_project"&&(typeof p.enabled!=="boolean"||!integer(p.defaultLimit,1,200)||!integer(p.projectLimit,1,1000)||!validModel(p.defaultModel)))return response({error:"Ungültige Projekteinstellungen."},400,origin);
    if(body.action==="update_user"&&(!isString(p.userId,36)||!/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(p.userId)||!(p.enabledOverride===null||typeof p.enabledOverride==="boolean")||!(p.dailyLimit===null||integer(p.dailyLimit,1,200))||!integer(p.bonus,0,180)||!(p.modelOverride===null||validModel(p.modelOverride))))return response({error:"Ungültige Nutzereinstellungen."},400,origin);
    const result=await policy(auth.user.id,body.action,p);
    return response(result.allowed?{ok:true}:{error:policyError(result.reason)},result.allowed?200:400,origin);
   }
   // Explicit, quota-counted paid test. Never includes real workspace data.
   if(body.consent!==true||!validModel(body.model)||forceDisabled())return response({error:"Modelltest nicht freigegeben."},400,origin);
   const testProvider=config(body.model);
   if(!testProvider)return response({error:"Amazon Bedrock ist nicht konfiguriert."},503,origin);
   const reserved=await policy(auth.user.id,"reserve_test",{model:body.model});
   if(!reserved.allowed)return response({error:policyError(reserved.reason)},429,origin);
   const result=await requestBedrock(testProvider,MASTER_PLAYBOOK,{workspaceTitle:"Synthetic model verification",selectedId:"test:root",nodes:[{id:"test:root",label:"Synthetic root",kind:"root",widgets:[]}],allowedFields:["factory"],edges:[],filters:[],canEdit:true,question:"Synthetic test. Return a short answer and exactly one add_widget operation for test:root, label OTIF, widgetType kpi, metric otifRate. All other fields null. No other operations."},PLAN_SCHEMA);
   const plan=validatePlan(result.plan,["test:root"],["factory"],true);
   if(plan.operations.length!==1||plan.operations[0].kind!=="add_widget"||plan.operations[0].target!=="test:root"||plan.operations[0].widgetType!=="kpi"||plan.operations[0].metric!=="otifRate")return response({error:"Modelltest hat keine gültige Testoperation geliefert."},502,origin);
   const marked=await policy(auth.user.id,"mark_verified",{model:body.model});
   if(!marked.allowed)return response({error:"Modelltest konnte nicht gespeichert werden."},503,origin);
   return response({ok:true,model:body.model,usage:result.usage},200,origin);
  }
  if(body?.action!=="ask"||body.consent!==true||!isString(body.prompt,1600))return response({error:"Ungültige Anfrage oder fehlende Freigabe."},400,origin);
  if(forceDisabled()||!config())return response({error:"Amazon Bedrock ist nicht verfügbar. Lokale Vorlagen sind verfügbar."},503,origin);
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
   return {id:n.id,label:n.label,kind:n.kind,metric:cleanText(n.metric,50),visualization:cleanText(n.visualization,40),chartDimension:cleanText(n.chartDimension,50),intervalKey:cleanText(n.intervalKey,50),containerCollapsed:n.containerCollapsed===true,containerId:cleanText(n.containerId,180),description:cleanText(n.description,240),question:cleanText(n.question,700),localFilters:modelFilters(n.localFilters),widgets:n.widgets.map((w:any)=>({id:cleanText(w?.id,120),type:cleanText(w?.type,40),title:cleanText(w?.title,100),metric:cleanText(w?.metric,50),dimension:cleanText(w?.dimension,50),compareDimension:cleanText(w?.compareDimension,50),width:w?.width==='half'?'half':'full',target:safeNumber(w?.target),intervalKey:cleanText(w?.intervalKey,50),distributionMeasure:cleanText(w?.distributionMeasure,50)}))};
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
  const reserved=await policy(auth.user.id,"reserve");
  if(!reserved.allowed)return response({error:policyError(reserved.reason)},reserved.reason==="disabled"||reserved.reason==="membership"?403:429,origin);
  const provider=config(reserved.model);
  if(!provider)return response({error:"Freigegebenes Modell nicht verfügbar."},503,origin);
  const metricsResult=await client.rpc("nxt_case_metrics",{p_filters:filters});
  if(metricsResult.error)return response({error:"Der aktuelle Filterkontext konnte nicht berechnet werden."},400,origin);
  const m=metricsResult.data;
  const metricKeys=["orders","otifRate","onTimeRate","volumeConformanceRate","otifCases","onTimeCases","inFullCases","onTimeNotFullCases","lateInFullCases","lateNotFullCases","affectedFactories","dateCoverage","volumeCoverage","otifCoverage","lateOrders","avgDelayDays","totalPenaltyEur","latePenaltyEur","shortfallPenaltyEur","kgEligibleCases","kgExcludedCases","unclassifiedCases"];
  const evidence:Record<string,unknown>={source:"nxt_case_metrics",scope:"selected node effective filters",segmentPolicy:"At most 12 displayed groups per dimension, ordered by modeled total penalty; groups with fewer than five cases omitted; not exhaustive",metrics:m?.orders>=5?Object.fromEntries(metricKeys.map(k=>[k,safeNumber(m?.[k])])):{suppressed:"Weniger als fünf Aufträge oder keine Daten."}};
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
  const graphFormat=context.graphFormat===2?2:1;
  const modelContext={workspaceTitle,selectedId:context.selectedId,nodes,edges,canEdit,allowedFields:fields,capabilities:{graphFormat,metrics:AI_METRICS,dashboardWidgets:AI_WIDGET_TYPES,canvasVisuals:graphFormat===2?AI_CANVAS_TYPES:['kpi'],intervalKeys:AI_INTERVAL_KEYS,maxActions:30,maxWidgetsPerNode:24,maxNodes:300,maxEdges:400},globalFilters:modelFilters(context.globalFilters),filters:modelFilters(filters),redactedEffectiveFilterCount:filters.length-modelFilters(filters).length,evidence,history,question:body.prompt};
  const {plan:parsed}=await requestBedrock(provider,MASTER_PLAYBOOK,modelContext,PLAN_SCHEMA);
  const plan=validatePlan(parsed,ids,fields,canEdit);
  if(graphFormat!==2&&plan.operations.some(o=>(o.kind==='add_branch'&&o.widgetType&&o.widgetType!=='kpi')||(o.kind==='add_container'&&o.value==='standalone')))return response({error:'Bitte die Website neu laden, um neue Canvas-Visualisierungen zu verwenden.'},409,origin);
  return response(plan,200,origin);
 }catch(e){if(e instanceof BedrockError)return response({error:e.message},e.status,origin);if(e instanceof Error&&e.message==="KI-Verwaltung nicht verfügbar.")return response({error:e.message},503,origin);return response({error:e instanceof Error&&/Ungültig|Unbekannt|Dimension|Zielwert|Filter|Widget|Knoten|lesbar|Kennzahl/.test(e.message)?e.message:"Die Anfrage konnte nicht sicher verarbeitet werden."},400,origin)}
});
