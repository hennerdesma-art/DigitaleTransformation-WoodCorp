import {createClient} from "npm:@supabase/supabase-js@2.119.0";
import {PLAN_SCHEMA,validatePlan,KNOWLEDGE_VERSION,AI_DIMENSIONS,AI_METRICS,AI_FILTER_FIELDS,AI_SEGMENT_METRICS,AI_WIDGET_TYPES,AI_CANVAS_TYPES,AI_INTERVAL_KEYS,AI_GRAPH_FORMAT,AI_CONTAINER_TONES,AI_LAYOUT_ACTIONS,AI_BRANCH_PLACEMENTS,requiresGraph3,AI_PROMPT_LIMIT,AI_HISTORY_LIMIT,assistantPromptProblem,resolveAssistantIntent,buildRequestBlocker,buildPlanProblem} from "./protocol.ts";
import {suggestedResearch,researchRequest,sanitizeResearch,plannedResearchChecks,evidenceSummary} from './researchEvidence.ts';
import {parseAiResearch,parseAiDisplay,hasJsonConfig,AI_RESEARCH_TABS,AI_RESEARCH_DIMENSIONS,AI_CONTROL_FIELDS,AI_RESEARCH_EXPOSURES} from './protocol.ts';
import {MASTER_PLAYBOOK} from "./knowledge.ts";
import {costDriverCombinations,isCostDrilldown} from "./costEvidence.ts";
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
const geometry=(v:unknown,min:number,max:number)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max?Math.round(v):null;
const xy=(v:any)=>v&&typeof v==="object"?{x:geometry(v.x,-100000,100000),y:geometry(v.y,-100000,100000)}:null;
const boxSize=(v:any)=>v&&typeof v==="object"?{width:geometry(v.width,1,4000),height:geometry(v.height,1,4000)}:null;
const safeFields=new Set<string>(AI_FILTER_FIELDS);
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
  if(Number(req.headers.get("content-length")||0)>450000)return response({error:"Anfrage zu groß."},413,origin);
  const raw=await req.text();if(new TextEncoder().encode(raw).length>450000)return response({error:"Anfrage zu groß."},413,origin);
  let body:any;try{body=JSON.parse(raw)}catch{return response({error:"Ungültiges JSON."},400,origin)}
  if(body?.action==="status"){
   const p=await policy(auth.user.id,"status");
   if(!p.allowed)return response({error:policyError(p.reason)},403,origin);
   return response({...p,enabled:p.projectEnabled&&p.userEnabled&&!forceDisabled()&&!!config(p.model),configured:!!config(p.model),forcedDisabled:forceDisabled(),provider:"Amazon Bedrock",modelLabel:MODEL_LABELS[p.model],region:BEDROCK_REGION,knowledgeVersion:KNOWLEDGE_VERSION,graphFormat:AI_GRAPH_FORMAT,researchProtocol:1},200,origin);
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
  if(body?.action!=="ask"||body.consent!==true)return response({error:"Ungültige Anfrage oder fehlende Freigabe."},400,origin);
  const promptProblem=assistantPromptProblem(body.prompt);
  if(promptProblem)return response({error:promptProblem},typeof body.prompt==="string"&&body.prompt.length>AI_PROMPT_LIMIT?413:400,origin);
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
  const intent=resolveAssistantIntent(body.prompt,body.intent);
  // Permission and protocol checks run before reserving quota or transmitting any data.
  const blocker=buildRequestBlocker(intent,canEdit,context.graphFormat);
  if(blocker)return response({error:blocker.message},blocker.status,origin);
  const {data:catalog,error:catalogError}=await client.from("nxt_filter_catalog").select("field_key").eq("enabled",true);
  if(catalogError||!catalog)return response({error:"Filterkatalog nicht verfügbar."},503,origin);
  const validationFields=catalog.map(x=>x.field_key).filter(x=>context.allowedFields.includes(x));
  const fields=validationFields.filter(x=>safeFields.has(x));
  const researchEnabled=context.researchProtocol===1;
  const cleanResearch=(v:unknown)=>{try{if(!researchEnabled||!v)return null;const s=parseAiResearch(JSON.stringify(v),validationFields);return researchRequest(s as any)?s:null}catch{return null}};
  const cleanDisplay=(type:unknown,v:unknown)=>{try{if(!researchEnabled||typeof type!=='string'||!v)return null;return parseAiDisplay(type,JSON.stringify(v),validationFields)}catch{return null}};
  // Validate and minimize context. Selected node and IDs are logical references, never executable SQL.
  const nodes=context.nodes.map((n:any)=>{
   if(!n||!isString(n.id,180)||!isString(n.label,100)||!["root","segment","metric","note","condition","container"].includes(n.kind)||!Array.isArray(n.widgets)||n.widgets.length>24)throw Error("Ungültiger Knoten.");
   return {id:n.id,label:n.label,kind:n.kind,metric:cleanText(n.metric,50),visualization:cleanText(n.visualization,40),chartDimension:cleanText(n.chartDimension,50),intervalKey:cleanText(n.intervalKey,50),containerCollapsed:n.containerCollapsed===true,containerTone:AI_CONTAINER_TONES.includes(n.containerTone)?n.containerTone:null,position:xy(n.position),world:xy(n.world),size:boxSize(n.size),containerId:cleanText(n.containerId,180),description:cleanText(n.description,240),question:cleanText(n.question,700),localFilters:modelFilters(n.localFilters),widgets:n.widgets.map((w:any)=>({id:cleanText(w?.id,120),type:cleanText(w?.type,40),title:cleanText(w?.title,100),metric:cleanText(w?.metric,50),dimension:cleanText(w?.dimension,50),compareDimension:cleanText(w?.compareDimension,50),width:w?.width==='half'?'half':'full',target:safeNumber(w?.target),intervalKey:cleanText(w?.intervalKey,50),distributionMeasure:cleanText(w?.distributionMeasure,50),research:cleanResearch(w?.research),display:cleanDisplay(w?.type,w?.display)}))};
  });
  const ids=nodes.map((n:any)=>n.id);if(new Set(ids).size!==ids.length||!ids.includes(context.selectedId))return response({error:"Ausgewählter Knoten nicht vorhanden."},400,origin);
  const edges=context.edges.map((e:any)=>({source:e?.source,target:e?.target,kind:e?.kind==='annotation'?'annotation':'filter'})).filter((e:any)=>ids.includes(e.source)&&ids.includes(e.target));
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
  const metricKeys=["orderedKg","deliveredKg","avgOrderedKg","orders","otifRate","onTimeRate","volumeConformanceRate","otifCases","onTimeCases","inFullCases","onTimeNotFullCases","lateInFullCases","lateNotFullCases","affectedFactories","dateCoverage","volumeCoverage","otifCoverage","lateOrders","avgDelayDays","totalPenaltyEur","latePenaltyEur","shortfallPenaltyEur","kgEligibleCases","kgExcludedCases","unclassifiedCases","penaltyPerOrderEur","penaltyPerKgEur","penaltyOrderValueRate","underDeliveryRate","overDeliveryRate","overDeliveryKg","quantityDeviationPct","orderConfirmationDays","productionPreparationDays","shipmentBufferDays","quantityChangesAfterStart","quantityChangesAfterEnd","quantityChangesAfterShip","creditBlockRate","scheduleChangeRate","processVariantCount","dataQualityCoverageRate"];
  const evidence:Record<string,unknown>={source:"nxt_case_metrics",scope:"selected node effective filters",segmentPolicy:"At most 12 displayed groups per dimension, ordered by modeled total penalty; groups with fewer than five cases omitted; not exhaustive",metrics:m?.orders>=5?Object.fromEntries(metricKeys.map(k=>[k,safeNumber(m?.[k])])):{suppressed:"Weniger als fünf Aufträge oder keine Daten."}};
  if(m?.orders>=5){
   const extra=/kredit|credit|bestätig|confirmation/i.test(body.prompt)?["credit_block","quantity_change_group","factory_product"]: /kunden|customer|markt|market|land|country/i.test(body.prompt)?["cust_market","cust_country","order_size_class"]: /prozess|qualität|quality|interval|produktion|transport/i.test(body.prompt)?["process_order_quality","quantity_change_phase","factory_product"]:["factory_product","quantity_change_group","quantity_deviation_class"];
   const requested=/mengenänder|quantity change/i.test(body.prompt)?["quantity_change_group"]:[];
   const dims=[...new Set(["factory","product_type","delivery_company",...requested,...extra])].filter(x=>fields.includes(x)).slice(0,7);
   const fetchSegment=(p_field:string)=>client.rpc("nxt_chart_segments",{p_field,p_filters:filters});
   const results=[...await Promise.allSettled(dims.slice(0,3).map(fetchSegment)),...await Promise.allSettled(dims.slice(3).map(fetchSegment))];
   evidence.segments=Object.fromEntries(results.map((r,i)=>{
    if(r.status!=="fulfilled"||r.value.error||!Array.isArray(r.value.data))return [dims[i],{unavailable:true}];
    const rows=r.value.data.filter((x:any)=>x.orders>=5).sort((a:any,b:any)=>Number(b.total_penalty_eur||0)-Number(a.total_penalty_eur||0)).slice(0,12).map((x:any)=>({label:cleanText(x.label,100),orders:safeNumber(x.orders),otif_rate:safeNumber(x.otif_rate),on_time_rate:safeNumber(x.on_time_rate),volume_rate:safeNumber(x.volume_rate),total_penalty_eur:safeNumber(x.total_penalty_eur),late_penalty_eur:safeNumber(x.late_penalty_eur),shortfall_penalty_eur:safeNumber(x.shortfall_penalty_eur),...Object.fromEntries(["orderedKg","deliveredKg","avgOrderedKg","penaltyPerOrderEur","penaltyPerKgEur","penaltyOrderValueRate","underDeliveryRate","overDeliveryRate","overDeliveryKg","quantityDeviationPct","orderConfirmationDays","productionPreparationDays","shipmentBufferDays","quantityChangesAfterStart","quantityChangesAfterEnd","quantityChangesAfterShip","creditBlockRate","scheduleChangeRate","processVariantCount","dataQualityCoverageRate"].map(k=>[k,safeNumber(x[k])]))}));
    return [dims[i],rows];
   }));
   // Bounded additional read-only aggregate queries using the caller's RLS context.
   // Joint cells, not independent marginal rankings, support the requested cost drilldown.
   if(isCostDrilldown(body.prompt)&&["factory","product_type","delivery_company"].every(f=>fields.includes(f))){
    const productIndex=dims.indexOf("product_type"), productResult=results[productIndex];
    const products=productResult?.status==="fulfilled"&&!productResult.value.error?productResult.value.data:null;
    evidence.costDriverCombinations=await costDriverCombinations(products,filters,m.orders,async scoped=>{
     const r=await client.rpc("nxt_chart_heatmap",{p_x_field:"factory",p_y_field:"delivery_company",p_filters:scoped});
     return r.error?null:r.data;
    });
   }
   if(/prozess|interval|bottleneck|durchlauf|produktion|root cause|ursach/i.test(body.prompt)){
    const p=await client.rpc("nxt_e02_interval_summary",{p_filters:filters});
    if(!p.error&&Array.isArray(p.data?.intervals))evidence.processIntervals=p.data.intervals.slice(0,5).map((x:any)=>({key:x.key,validCases:x.validCases,missingCases:x.missingCases,negativeCases:x.negativeCases,medianDays:x.validCases>=5?x.medianDays:null,p90Days:x.validCases>=5?x.p90Days:null,otifValidCases:x.otifValidCases,nonOtifValidCases:x.nonOtifValidCases,otifMedianDays:x.otifValidCases>=5?x.otifMedianDays:null,nonOtifMedianDays:x.nonOtifValidCases>=5?x.nonOtifMedianDays:null}));
   }
  }
  const researchDeadline=Date.now()+125000;
  const queryResearch=async(spec:any,scope:any[])=>{
   const request=researchRequest(spec);if(!request)return {status:'private_browser_only'};
   try{const r=await client.rpc('nxt_deep_analysis',{p_mode:request.mode,p_filters:scope,p_options:request.options});return r.error?{status:'unavailable',tab:spec.tab}:sanitizeResearch(r.data,spec)}catch{return {status:'unavailable',tab:spec.tab}};
  };
  if(researchEnabled&&m?.orders>=5&&intent!=='edit_layout'){
   const selected=nodes.find((n:any)=>n.id===context.selectedId);
   const specs=suggestedResearch(body.prompt,validationFields,(selected?.widgets||[]).map((w:any)=>w.research).filter(Boolean),evidence.segments as Record<string,unknown>||{});
   const supported=specs.filter(s=>['groups','costs','compare','process','variants','quality'].includes(s.tab));
   evidence.deepResearch=await Promise.all(supported.map(async spec=>({spec,result:await queryResearch(spec,filters)})));
  }
  const history=Array.isArray(body.history)?body.history.slice(-8).filter((x:any)=>["user","assistant"].includes(x?.role)&&isString(x.text,AI_HISTORY_LIMIT)).map((x:any)=>({role:x.role,text:x.text})):[];
  const graphFormat=context.graphFormat===AI_GRAPH_FORMAT?AI_GRAPH_FORMAT:context.graphFormat===2?2:1;
  const modelContext={requestIntent:intent,workspaceTitle,selectedId:context.selectedId,nodes,edges,canEdit,allowedFields:fields,capabilities:{graphFormat,researchProtocol:researchEnabled?1:0,researchTabs:researchEnabled?AI_RESEARCH_TABS:[],researchDimensions:researchEnabled?AI_RESEARCH_DIMENSIONS.filter(d=>validationFields.includes(d)||d==='order_received_month'&&validationFields.includes('order_received_date')||d==='promised_month'&&validationFields.includes('promised_date')):[],researchControls:AI_CONTROL_FIELDS.filter(d=>fields.includes(d)),researchExposures:AI_RESEARCH_EXPOSURES.filter(d=>fields.includes(d)),privateChartGrouping:validationFields.filter(d=>['cust_id','cust_name'].includes(d)),metrics:AI_METRICS,segmentMetrics:AI_SEGMENT_METRICS,filterFields:AI_FILTER_FIELDS,findingActions:['add_finding','edit_finding','add_reference'],dashboardWidgets:researchEnabled?AI_WIDGET_TYPES:AI_WIDGET_TYPES.filter(t=>t!=='research'),canvasVisuals:graphFormat>=2?(researchEnabled?AI_CANVAS_TYPES:AI_CANVAS_TYPES.filter(t=>t!=='research')):['kpi'],layoutActions:graphFormat===AI_GRAPH_FORMAT?(researchEnabled?AI_LAYOUT_ACTIONS:AI_LAYOUT_ACTIONS.filter(k=>k!=='optimize_layout'&&k!=='resize_node')):[],containerTones:graphFormat===AI_GRAPH_FORMAT?AI_CONTAINER_TONES:[],branchPlacements:graphFormat===AI_GRAPH_FORMAT?AI_BRANCH_PLACEMENTS:[],intervalKeys:AI_INTERVAL_KEYS,maxActions:30,recommendedActionsPerStage:18,maxWidgetsPerNode:24,maxNodes:300,maxEdges:400},globalFilters:modelFilters(context.globalFilters),filters:modelFilters(filters),redactedEffectiveFilterCount:filters.length-modelFilters(filters).length,evidence,history,question:body.prompt};
  const check=(parsed:unknown)=>{
   const plan=validatePlan(parsed,ids,validationFields,canEdit);
   const problem=buildPlanProblem(intent,plan);if(problem)throw Error(problem);
   if(!researchEnabled&&plan.operations.some(o=>o.widgetType==='research'||['configure_widget','optimize_layout','resize_node'].includes(o.kind)||hasJsonConfig(o.value)))throw Error('Bitte die Website neu laden, um neue Analysefunktionen zu verwenden.');
   const widgets=new Map<string,Map<string,string>>(nodes.map((n:any)=>[n.id,new Map(n.widgets.map((w:any)=>[w.id,w.type]))]));
   const kinds=new Map<string,string>(nodes.map((n:any)=>[n.id,n.kind]));
   for(const op of plan.operations){
    const type=kinds.get(op.target);
    if(['configure_widget','rename_widget','remove_widget'].includes(op.kind)&&!widgets.get(op.target)?.has(op.widgetId!))throw Error('Widget-ID im Zielknoten existiert nicht.');
    if(op.kind==='configure_widget'&&widgets.get(op.target)?.get(op.widgetId!)!==op.widgetType)throw Error('Widgettyp passt nicht zum vorhandenen Element.');
    if(['set_node_visualization','set_node_metric','add_widget','set_question'].includes(op.kind)&&type==='note')throw Error('Finding ist kein Dashboard.');
    if(op.kind==='set_node_visualization'&&type==='container')throw Error('Container nicht in Diagramm umwandeln.');
    if(op.kind==='add_branch'&&op.field==='member'&&type!=='container')throw Error('Mitglied benötigt Container.');
    if(op.kind==='add_branch'&&type==='container'&&(op.field==='member'||op.field===null)&&nodes.some((n:any)=>n.id===op.target&&n.containerCollapsed))throw Error('Container ist eingeklappt. Wähle einen direkten Zweig oder separaten Container.');
    if(op.ref){kinds.set(op.ref,op.kind==='add_container'?'container':op.kind==='add_finding'?'note':'metric');widgets.set(op.ref,new Map());}
   }
   return plan;
  };
  let plan;
  // At most two model calls per explicitly authorized request. A failed plan never mutates the workspace.
  try{const {plan:parsed}=await requestBedrock(provider,MASTER_PLAYBOOK,modelContext,PLAN_SCHEMA,fetch,80000);plan=check(parsed);}
  catch(e){
   if(e instanceof BedrockError&&e.status!==422||Date.now()>researchDeadline-25000)throw e;
   const diagnostic=e instanceof Error?e.message:'Ungültiger Vorschlag';
   const retry=await requestBedrock(provider,MASTER_PLAYBOOK+'\nCORRECTION: Return a complete corrected executable plan for the original request. Preserve all valid requirements, resolve the validation diagnostic, and do not merely explain the failure.',{...modelContext,validationDiagnostic:diagnostic.slice(0,500)},PLAN_SCHEMA,fetch,Math.max(1000,Math.min(45000,researchDeadline-Date.now())));
   plan=check(retry.plan);
  }
  if(researchEnabled&&plan.operations.length&&Date.now()<researchDeadline-12000){
   const checks=plannedResearchChecks({selectedId:context.selectedId,nodes:context.nodes,edges,globalFilters:context.globalFilters,filters},plan.operations,v=>parseAiResearch(v,validationFields) as any);
   const verified=await Promise.all(checks.map(async c=>({target:c.target,label:c.label,spec:c.spec,e:await queryResearch(c.spec,c.filters)})));
   const good=verified.filter(x=>x.e.status==='available');
   if(good.length){
    // Verified facts are appended separately, and never claimed as observations from an unqueried scope.
    const suffix='\n\nDatenprüfung der vorgeschlagenen Live-Analysen (noch nicht übernommen):\n'+good.map(x=>'• '+x.label+': '+evidenceSummary(x.e)).join('\n');
    plan={...plan,answer:plan.answer.slice(0,Math.max(0,9950-suffix.length))+suffix};
    // Only explicit documentation requests add evidence-backed findings. Avoid duplicates and preserve other operations.
    if(canEdit&&/finding|erkenntnis|beobachtung|dokumentier|befund/i.test(body.prompt)){
     for(let i=0;i<good.length&&plan.operations.length<30;i++){
      const x=good[i];if(plan.operations.some(o=>o.kind==='add_finding'&&o.target===x.target))continue;
      const ref='new:verified_'+i;if(plan.operations.some(o=>o.ref===ref)||ids.includes(ref))continue;
      plan.operations.push({kind:'add_finding',target:x.target,ref,label:('Datenprüfung · '+x.label).slice(0,100),widgetType:null,metric:null,dimension:null,compareDimension:null,field:null,widgetId:null,targetValue:null,value:('Beobachtung (Live-Aggregation vor Übernahme): '+evidenceSummary(x.e)+'\nMethode: '+String(x.e.method||'Filtergebundene Auftragsaggregation')+'\nWeitere Interpretation fachlich prüfen.').slice(0,1800)});
     }
    }
   }
  }
  plan=validatePlan(plan,ids,validationFields,canEdit);
  if((graphFormat<2&&plan.operations.some(o=>(o.kind==='add_branch'&&o.widgetType&&o.widgetType!=='kpi')||(o.kind==='add_container'&&o.value==='standalone')))||(graphFormat!==AI_GRAPH_FORMAT&&plan.operations.some(requiresGraph3)))return response({error:'Bitte die Website neu laden, um neue Canvas-Visualisierungen zu verwenden.'},409,origin);
  return response(plan,200,origin);
 }catch(e){if(e instanceof BedrockError)return response({error:e.message},e.status,origin);if(e instanceof Error&&e.message==="KI-Verwaltung nicht verfügbar.")return response({error:e.message},503,origin);return response({error:e instanceof Error&&/Ungültig|Unbekannt|Dimension|Zielwert|Filter|Widget|Knoten|lesbar|Kennzahl|Position|Container|Layout|Platzierung|Visualisierung/.test(e.message)?e.message:"Die Anfrage konnte nicht sicher verarbeitet werden."},400,origin)}
});
