/** Shared, deliberately narrow NXT Intelligence contract. No executable SQL or arbitrary code. */
export const ACTION_KINDS=['add_widget','rename_node','set_question','add_branch','add_container','add_filter','remove_widget','rename_widget','set_node_metric'] as const;
export type ActionKind=typeof ACTION_KINDS[number];
export type AiAction={kind:ActionKind;target:string;label:string|null;ref:string|null;widgetType:string|null;metric:string|null;dimension:string|null;compareDimension:string|null;field:string|null;value:string|null;widgetId:string|null;targetValue:number|null};
export type AiPlan={answer:string;operations:AiAction[]};
export const KNOWLEDGE_VERSION='nxt-ai-v1.0';
export const AI_WIDGET_TYPES=['kpi','line','bar','table','donut','text','bar_horizontal','bar_vertical','stacked','stacked100','heatmap','pareto','scatter','waterfall','bullet','histogram','treemap','funnel','e02_overview','e02_compare','e02_quality','e02_distribution'] as const;
export const AI_METRICS=['orders','otifRate','onTimeRate','volumeConformanceRate','otifCases','lateOrders','avgDelayDays','affectedFactories','totalPenaltyEur','latePenaltyEur','shortfallPenaltyEur'] as const;
export const AI_DIMENSIONS=['factory','product_type','delivery_company','warehouse_type','cust_country','delivery_year','cust_market','delivered_quantity_unit','order_tolerance_met','otif_status'] as const;
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
   known.add(op.ref);
  }else if(op.kind==='rename_node'||op.kind==='rename_widget'){
   if(!str(op.label,100))throw Error('Titel fehlt oder ist zu lang.');
  }else if(op.kind==='set_question'){
   if(!str(op.label,700))throw Error('Forschungsfrage fehlt.');
  }else if(op.kind==='add_widget'){
   if(!isOne(AI_WIDGET_TYPES,op.widgetType)||!str(op.label,100))throw Error('Widgettyp oder Titel ungültig.');
   if(op.widgetType==='bullet'&&op.targetValue==null)throw Error('Zielwert ausdrücklich angeben.');
  }else if(op.kind==='add_filter'){
   if(!op.field||!allowed.has(op.field)||!str(op.value,200))throw Error('Filterfeld oder Filterwert ungültig.');
  }else if(op.kind==='set_node_metric'&&!op.metric)throw Error('Kennzahl fehlt.');
  if(['remove_widget','rename_widget'].includes(op.kind)&&!str(op.widgetId,120))throw Error('Widget-ID fehlt.');
  out.push(op);
 }
 return {answer:p.answer.trim(),operations:out};
}
