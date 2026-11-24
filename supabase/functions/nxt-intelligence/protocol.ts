/** Shared, deliberately narrow NXT Intelligence contract. No executable SQL or arbitrary code. */
export const ACTION_KINDS=['add_widget','rename_node','set_question','add_branch','add_container','add_filter','remove_widget','rename_widget','set_node_metric','move_node','set_container_style','resize_container','arrange_container','set_node_visualization'] as const;
export type ActionKind=typeof ACTION_KINDS[number];
export type AiAction={kind:ActionKind;target:string;label:string|null;ref:string|null;widgetType:string|null;metric:string|null;dimension:string|null;compareDimension:string|null;field:string|null;value:string|null;widgetId:string|null;targetValue:number|null};
export type AiPlan={answer:string;operations:AiAction[]};
export const KNOWLEDGE_VERSION='nxt-ai-v1.3.0';
export const AI_GRAPH_FORMAT=3 as const;
export const AI_CONTAINER_TONES=['teal','slate','sand'] as const;
export const AI_LAYOUT_ACTIONS=['move_node','set_container_style','resize_container','arrange_container','set_node_visualization'] as const;
export const AI_BRANCH_PLACEMENTS=['direct','member','standalone'] as const;
export function coordinatePair(value:unknown,minX:number,maxX:number,minY:number,maxY:number):{x:number;y:number}|null{
 if(typeof value!=='string'||!/^\s*-?\d{1,6}\s*,\s*-?\d{1,6}\s*$/.test(value))return null;
 const [x,y]=value.split(',').map(Number);
 return x>=minX&&x<=maxX&&y>=minY&&y<=maxY?{x,y}:null;
}
export function requiresGraph3(op:AiAction){return (AI_LAYOUT_ACTIONS as readonly string[]).includes(op.kind)||(op.kind==='add_branch'&&op.field!==null)}
export const AI_PROMPT_LIMIT=6000;
export const AI_HISTORY_LIMIT=6000;
export function assistantPromptProblem(prompt:unknown):string|null{
 if(typeof prompt!=='string'||!prompt.trim())return 'Bitte eine Frage oder einen Änderungswunsch eingeben.';
 if(prompt.length>AI_PROMPT_LIMIT)return 'Die Anfrage überschreitet '+AI_PROMPT_LIMIT.toLocaleString('de-DE')+' Zeichen. Bitte kürzen; es wurde nichts abgeschnitten oder gesendet.';
 return null;
}
export function boundedAssistantHistory(text:string,operationsSummary=''):string{
 const joined=text+(operationsSummary?'\n'+operationsSummary:'');
 const marker='\n[Älterer Chatkontext gekürzt]';
 return joined.length<=AI_HISTORY_LIMIT?joined:joined.slice(0,AI_HISTORY_LIMIT-marker.length)+marker;
}
export type AiRequestIntent='auto'|'build_path'|'build_dashboard'|'edit_layout';
// Explicit UI actions and unambiguous creation commands are not advisory requests.
// Ambiguous conversational prompts are left to the model, rather than forced into mutation mode.
export function resolveAssistantIntent(prompt:string,explicit:unknown=null):AiRequestIntent{
 if(explicit==='build_path'||explicit==='build_dashboard'||explicit==='edit_layout')return explicit;
 const p=prompt.trim().toLocaleLowerCase('de-DE');
 if(/^(wie|warum|was|welche[rsn]?|wieso|erkläre|beschreibe|bewerte|prüfe|analysiere|how|why|what|explain|describe|review)\b/.test(p)||/^(bitte\s+)?(nicht|keine)\b/.test(p))return 'auto';
 const layout=/^(?:(?:bitte|kannst du|könntest du|würdest du|please|can you|could you)\s+)*(?:verschieb\w*|sortier\w*|ordn\w*|rück\w*|vergrößer\w*|verkleiner\w*|färb\w*|gestalt\w*|arrangier\w*|move|arrange|resize|recolor|style|align)\b/.test(p)||(/^(?:ändere|passe|mach|setze|wechsle|change|set|kannst du|könntest du|bitte)\b/.test(p)&&/\b(?:farbe|farben|farbton|layout|position|größe|diagrammtyp|visualisierung|verschieben|anordnen|containergröße|color|size|position|chart type)\b/.test(p)&&!/\b(?:nicht|keine)\b/.test(p));
 if(layout&&!/\b(?:erstell\w*|generier\w*|create|generate)\b/.test(p))return 'edit_layout';
 const command=/^(?:(?:bitte|kannst du|könntest du|würdest du|please|can you|could you)\s+)*(?:erstell(?:e|en)?|generier(?:e|en)?|bau(?:e|en)?|entwirf|entwickle|ergänz(?:e|en)?|füge|create|generate|build|design|add)\b/.test(p);
 const desire=/^(?:ich möchte|ich will|wir möchten|wir wollen|i want)\b/.test(p)&&/\b(?:erstell\w*|generier\w*|aufbauen|build|create)\b/.test(p);
 const extend=/^(?:bitte|kannst du|könntest du|würdest du|ich möchte|ich will|can you|could you|please|erweitere|baue|entwickle)\b/.test(p)&&/\b(?:weiter\s+ausbauen|ausbauen|erweiter\w*|weiterentwickel\w*|fortsetzen|extend|expand)\b/.test(p)&&!/\b(?:nicht|keine)\b/.test(p);
 if(!command&&!desire&&!extend)return 'auto';
 if(/thinking[\s-]*path|analysepfad|analysebaum|decision[\s-]*tree|analysegraph|ursachenbaum/.test(p))return 'build_path';
 if(/dashboard/.test(p))return 'build_dashboard';
 return 'auto';
}
export function buildRequestBlocker(intent:AiRequestIntent,canEdit:boolean,graphFormat:unknown):{status:number;message:string}|null{
 if(intent==='auto')return null;
 if(!canEdit)return {status:403,message:'Dieser Workspace ist nur lesbar. Öffne einen eigenen bearbeitbaren Workspace oder bitte einen Administrator um Freigabe. Es wurde keine KI-Anfrage berechnet.'};
 if(graphFormat!==AI_GRAPH_FORMAT)return {status:409,message:'Dein Browser verwendet einen älteren KI-Graph-Stand. Bitte speichere offene Änderungen und lade NXT Analytics mit Strg+F5 neu. Es wurde keine KI-Anfrage berechnet.'};
 return null;
}
export function buildPlanProblem(intent:AiRequestIntent,plan:AiPlan):string|null{
 if(intent==='build_path'&&!plan.operations.some(o=>o.kind==='add_branch'))return 'Die KI hat keinen ausführbaren neuen Analysezweig geliefert. Bitte erneut versuchen oder den gewünschten neuen Analysefokus angeben. Vorhandene Inhalte bleiben unverändert.';
 if(intent==='edit_layout'&&!plan.operations.some(o=>requiresGraph3(o)))return 'Die KI hat keine ausführbare Layout- oder Gestaltungsänderung geliefert. Bitte erneut versuchen; der Workspace bleibt unverändert.';
 if(intent==='build_dashboard'&&!plan.operations.some(o=>o.kind==='add_widget'))return 'Die KI hat keine neuen Dashboard-Elemente geliefert. Bitte erneut versuchen oder einen konkreten Ergänzungswunsch angeben. Vorhandene Inhalte bleiben unverändert.';
 return null;
}

export const AI_WIDGET_TYPES=['kpi','line','bar','table','donut','text','bar_horizontal','bar_vertical','stacked','stacked100','heatmap','pareto','scatter','waterfall','bullet','histogram','treemap','funnel','e02_overview','e02_compare','e02_quality','e02_distribution'] as const;
export const AI_METRICS=['orders','otifRate','onTimeRate','volumeConformanceRate','otifCases','lateOrders','avgDelayDays','affectedFactories','totalPenaltyEur','latePenaltyEur','shortfallPenaltyEur'] as const;
export const AI_DIMENSIONS=['factory','product_type','delivery_company','warehouse_type','cust_country','delivery_year','cust_market','delivered_quantity_unit','order_tolerance_met','otif_status'] as const;
export const AI_CANVAS_TYPES=['kpi','bar','line','donut','stacked','stacked100','heatmap','pareto','scatter','waterfall','histogram','treemap','funnel','process_interval'] as const;
export const AI_INTERVAL_KEYS=['order_to_production','production_duration','production_to_shipment','shipment_to_delivery','order_to_delivery'] as const;
const CANVAS_GROUPED=['bar','stacked','stacked100','heatmap','pareto','scatter','treemap'];
const COST_VISUALS=['pareto','waterfall','treemap'];
const slots=['label','ref','widgetType','metric','dimension','compareDimension','field','value','widgetId'] as const;
const nullable={type:['string','null']};
export const PLAN_SCHEMA={type:'object',additionalProperties:false,required:['answer','operations'],properties:{answer:{type:'string'},operations:{type:'array',items:{type:'object',additionalProperties:false,required:['kind','target',...slots,'targetValue'],properties:{kind:{type:'string',enum:[...ACTION_KINDS]},target:{type:'string'},...Object.fromEntries(slots.map(k=>[k,nullable])),targetValue:{type:['number','null']}}}}}};
export function action(kind:ActionKind,target:string,patch:Partial<AiAction>={}):AiAction{
 return {kind,target,label:null,ref:null,widgetType:null,metric:null,dimension:null,compareDimension:null,field:null,value:null,widgetId:null,targetValue:null,...patch};
}
const str=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const isOne=(a:readonly string[],v:unknown)=>typeof v==='string'&&a.includes(v);
function validateCanvasVisual(op:AiAction,allowed:Set<string>){
    const viz=op.widgetType||'kpi';
    if(!isOne(AI_CANVAS_TYPES,viz))throw Error('Diagrammtyp im Thinking Path nicht unterstützt.');
    if(CANVAS_GROUPED.includes(viz)&&!op.dimension)throw Error('Canvas-Diagramm benötigt eine freigegebene Dimension.');
    if(op.dimension&&!CANVAS_GROUPED.includes(viz))throw Error('Canvas-Diagramm unterstützt keine Segmentdimension.');
    if(viz==='heatmap'){
     if(!['factory','product_type'].includes(op.dimension||''))throw Error('Canvas-Heatmap nutzt Werk und Produkttyp.');
     const other=op.dimension==='factory'?'product_type':'factory';
     if(!allowed.has(other)||(op.compareDimension!==null&&op.compareDimension!==other))throw Error('Canvas-Heatmap benötigt Werk und Produkttyp.');
    }else if(op.compareDimension)throw Error('Zweite Canvas-Dimension nur für Heatmap.');
    if(['bar','line'].includes(viz)&&op.metric&&op.metric!=='onTimeRate')throw Error('Canvas-Balken und Zeitreihe zeigen On-Time Delivery.');
    if(viz==='donut'&&op.metric&&!['otifRate','onTimeRate'].includes(op.metric))throw Error('Canvas-Donut zeigt OTIF oder On-Time Delivery.');
    if(COST_VISUALS.includes(viz)&&op.metric&&op.metric!=='totalPenaltyEur')throw Error('Canvas-Kostendiagramm zeigt modellierte Gesamtkosten.');
    if(['stacked','stacked100','heatmap','scatter','funnel'].includes(viz)&&op.metric&&op.metric!=='otifRate')throw Error('Canvas-Diagramm verwendet die fest definierte OTIF-Auswertung.');
    if(viz==='process_interval'&&!isOne(AI_INTERVAL_KEYS,op.value))throw Error('Gültiges Prozessintervall erforderlich.');
    if(viz==='histogram'&&op.value&&op.value!=='quantity_change_count')throw Error('Canvas-Histogramm zeigt Mengenänderungen; andere Verteilungen im Dashboard.');
    if(viz!=='process_interval'&&viz!=='histogram'&&op.value)throw Error('Nicht unterstützter Canvas-Parameter.');
}
export function validatePlan(input:unknown,existingIds:string[],allowedFields:string[],canEdit=true):AiPlan{
 if(!input||typeof input!=='object')throw Error('KI-Antwort ungültig.');
 const p=input as AiPlan;
 if(!str(p.answer,10000)||!Array.isArray(p.operations)||p.operations.length>30)throw Error('Ungültige Antwort oder zu viele Änderungen.');
 if(!canEdit&&p.operations.length)throw Error('Dieser Workspace ist nur lesbar.');
 const known=new Set(existingIds),allowed=new Set(allowedFields),out:AiAction[]=[];
 for(const raw of p.operations){
  if(!raw||!isOne(ACTION_KINDS,raw.kind)||!str(raw.target,180)||!known.has(raw.target))throw Error('Unbekannte Aktion oder Zielknoten.');
  for(const k of slots)if(raw[k]!=null&&!str(raw[k],k==='label'?700:k==='value'?200:180))throw Error('Ungültiges Aktionsfeld: '+k);
  if(raw.targetValue!=null&&(!Number.isFinite(raw.targetValue)||raw.targetValue<0||raw.targetValue>100))throw Error('Zielwert ungültig.');
  const op=action(raw.kind,raw.target,Object.fromEntries([...slots,'targetValue'].map(k=>[k,(raw as unknown as Record<string,unknown>)[k]??null])) as Partial<AiAction>);
  if(op.metric&&!isOne(AI_METRICS,op.metric))throw Error('Unbekannte Kennzahl.');
  for(const dim of [op.dimension,op.compareDimension])if(dim&&(!allowed.has(dim)||!isOne(AI_DIMENSIONS,dim)))throw Error('Dimension nicht freigegeben.');
  if(op.compareDimension&&op.compareDimension===op.dimension)throw Error('Heatmap benötigt unterschiedliche Dimensionen.');
  if(op.kind==='add_branch'||op.kind==='add_container'){
   if(!str(op.label,100)||!op.ref||!/^new:[a-zA-Z0-9_-]{1,40}$/.test(op.ref)||known.has(op.ref))throw Error('Neue Knoten brauchen einen eindeutigen Verweis und Titel.');
   if(op.kind==='add_container'){
    if(op.field!==null)throw Error('Container-Platzierung wird über value festgelegt.');
    if(op.value!==null&&op.value!=='standalone')throw Error('Container: nur standalone oder null als Verbindungsmodus.');
    if(op.widgetType||op.metric||op.dimension||op.compareDimension)throw Error('Container sind Gruppen und keine Diagramme.');
   }else{
    if(op.field!==null&&!isOne(AI_BRANCH_PLACEMENTS,op.field))throw Error('Platzierungsmodus ungültig.');
    validateCanvasVisual(op,allowed);
   }
   known.add(op.ref);
  }else if(op.kind==='move_node'||op.kind==='resize_container'||op.kind==='arrange_container'||op.kind==='set_container_style'){
   if(op.label||op.ref||op.widgetType||op.metric||op.dimension||op.compareDimension||op.field||op.widgetId||op.targetValue!==null)throw Error('Ungültige Parameter für Layout-Aktion.');
   if(op.kind==='move_node'&&!coordinatePair(op.value,-100000,100000,-100000,100000))throw Error('Position ungültig. Erwartet: x,y als ganze Zahlen.');
   if(op.kind==='resize_container'&&!coordinatePair(op.value,320,4000,160,4000))throw Error('Containergröße ungültig. Erwartet: Breite,Höhe innerhalb 320–4000 × 160–4000.');
   if(op.kind==='arrange_container'&&!['1','2','3'].includes(op.value||''))throw Error('Container-Anordnung benötigt 1, 2 oder 3 Spalten.');
   if(op.kind==='set_container_style'&&!isOne(AI_CONTAINER_TONES,op.value))throw Error('Containerfarbe ungültig.');
  }else if(op.kind==='set_node_visualization'){
   if(!op.widgetType||op.label||op.ref||op.field||op.widgetId||op.targetValue!==null)throw Error('Ungültige Parameter für Visualisierung.');
   validateCanvasVisual(op,allowed);
  }else if(op.kind==='rename_node'||op.kind==='rename_widget'){
   if(!str(op.label,100))throw Error('Titel fehlt oder ist zu lang.');
  }else if(op.kind==='set_question'){
   if(!str(op.label,700))throw Error('Forschungsfrage fehlt.');
  }else if(op.kind==='add_widget'){
   if(!isOne(AI_WIDGET_TYPES,op.widgetType)||!str(op.label,100))throw Error('Widgettyp oder Titel ungültig.');
   if(op.widgetType==='bullet'&&op.targetValue==null)throw Error('Zielwert ausdrücklich angeben.');
   if(op.widgetType==='bullet'&&op.metric&&!['otifRate','onTimeRate','volumeConformanceRate'].includes(op.metric))throw Error('Bullet benötigt eine Prozent-Kennzahl.');
   if(['bar_horizontal','bar_vertical'].includes(op.widgetType||'')&&op.metric&&!['orders','otifCases','lateOrders','otifRate','onTimeRate','volumeConformanceRate','totalPenaltyEur','latePenaltyEur','shortfallPenaltyEur'].includes(op.metric))throw Error('Kennzahl für Segmentvergleich nicht unterstützt.');
   if(['line','bar','donut'].includes(op.widgetType||'')&&op.metric&&op.metric!=='onTimeRate')throw Error('Dieses Dashboard-Diagramm zeigt On-Time Delivery.');
   if(COST_VISUALS.includes(op.widgetType||'')&&op.metric&&op.metric!=='totalPenaltyEur')throw Error('Dieses Dashboard-Diagramm zeigt modellierte Gesamtkosten.');
   if(['heatmap','scatter','stacked','stacked100'].includes(op.widgetType||'')&&op.metric&&op.metric!=='otifRate')throw Error('Dieses Dashboard-Diagramm nutzt die fest definierte OTIF-Auswertung.');
   if(op.widgetType==='e02_distribution'&&op.value&&!isOne(AI_INTERVAL_KEYS,op.value))throw Error('Prozessintervall ungültig.');
   if(op.widgetType==='histogram'&&op.value&&!['quantity_change_count','lateness_days'].includes(op.value))throw Error('Verteilung ungültig.');
  }else if(op.kind==='add_filter'){
   if(!op.field||!allowed.has(op.field)||!str(op.value,200))throw Error('Filterfeld oder Filterwert ungültig.');
  }else if(op.kind==='set_node_metric'&&!op.metric)throw Error('Kennzahl fehlt.');
  if(['remove_widget','rename_widget'].includes(op.kind)&&!str(op.widgetId,120))throw Error('Widget-ID fehlt.');
  out.push(op);
 }
 return {answer:p.answer.trim(),operations:out};
}
