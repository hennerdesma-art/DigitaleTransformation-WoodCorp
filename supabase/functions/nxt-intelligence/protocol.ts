/** Shared, deliberately narrow NXT Intelligence contract. No executable SQL or arbitrary code. */
export const ACTION_KINDS=['add_widget','rename_node','set_question','add_branch','add_container','add_filter','remove_widget','rename_widget','set_node_metric'] as const;
export type ActionKind=typeof ACTION_KINDS[number];
export type AiAction={kind:ActionKind;target:string;label:string|null;ref:string|null;widgetType:string|null;metric:string|null;dimension:string|null;compareDimension:string|null;field:string|null;value:string|null;widgetId:string|null;targetValue:number|null};
export type AiPlan={answer:string;operations:AiAction[]};
export const KNOWLEDGE_VERSION='nxt-ai-v1.2';
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
    if(op.value!==null&&op.value!=='standalone')throw Error('Container: nur standalone oder null als Verbindungsmodus.');
    if(op.widgetType||op.metric||op.dimension||op.compareDimension)throw Error('Container sind Gruppen und keine Diagramme.');
   }else{
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
   known.add(op.ref);
  }else if(op.kind==='rename_node'||op.kind==='rename_widget'){
   if(!str(op.label,100))throw Error('Titel fehlt oder ist zu lang.');
  }else if(op.kind==='set_question'){
   if(!str(op.label,700))throw Error('Forschungsfrage fehlt.');
  }else if(op.kind==='add_widget'){
   if(!isOne(AI_WIDGET_TYPES,op.widgetType)||!str(op.label,100))throw Error('Widgettyp oder Titel ungültig.');
   if(op.widgetType==='bullet'&&op.targetValue==null)throw Error('Zielwert ausdrücklich angeben.');
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
