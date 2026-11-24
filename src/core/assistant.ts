import {action,validatePlan,AI_GRAPH_FORMAT,AI_SEGMENT_METRICS,actionFilterValue,coordinatePair,type AiPlan,type AiAction} from './assistantProtocol';
import {freshWidget,normalizeDashboard,standardDashboard,makeDocument,METRICS,WIDGET_LABELS,METRIC_LABELS,type NodeDashboard,type MetricKey,type WidgetType} from './dashboard';
import {findingStamp} from './findings';
import {nodeFor,referenceEdge,annotationEdge,isValidAnnotation,isValidReference,moveIntoContainer,worldPosition,containerSize,changeContainerSettings,serializeDraft,type NNode,type NEdge} from './graph';
import {effectiveFilters,validateFilters,conflictingFields,formatFilter} from './filters';
import type {AnalysisNode,Filter,Metrics,GraphViz,ContainerTone} from './types';
import type {FieldKey} from '../config';
import {KPI_DEFINITIONS} from './kpiDefinitions';
import type {E02IntervalKey} from './processIntervals';
export type AssistantState={nodes:NNode[];edges:NEdge[];globals:Filter[];locals:Record<string,Filter[]>;dashboards:Record<string,NodeDashboard>;selectedId:string;allowedFields:FieldKey[]};
export type AssistantContext={graphFormat:typeof AI_GRAPH_FORMAT;workspaceId:string|null;revision:number|null;workspaceTitle:string;selectedId:string;nodes:{id:string;label:string;kind:string;metric:string|null;visualization:string|null;chartDimension:string|null;intervalKey:string|null;containerId:string|null;containerCollapsed:boolean;containerTone:string|null;position:{x:number;y:number};world:{x:number;y:number};size:{width:number;height:number};description:string|null;question:string|null;localFilters:{field:string;op:string;value:string|string[]}[];widgets:{id:string;type:string;title:string;metric:string|null;dimension:string|null;compareDimension:string|null;width:string;target:number|null;intervalKey:string|null;distributionMeasure:string|null}[]}[];edges:{source:string;target:string;kind?:string}[];filters:{field:string;op:string;value:string|string[]}[];globalFilters:{field:string;op:string;value:string|string[]}[];allowedFields:string[];canEdit:boolean};
export function resolveAssistantNodeId(nodes:NNode[],selectedId:string):string{
 return nodes.some(n=>n.id===selectedId)?selectedId:nodes.find(n=>n.data.analysis.kind==='root')?.id||nodes[0]?.id||'';
}
export function assistantFingerprint(s:AssistantState,workspaceId:string|null,revision:number|null){
 return JSON.stringify({workspaceId,revision,selectedId:s.selectedId,nodes:s.nodes.map(n=>[n.id,n.position,n.data.analysis]),edges:s.edges.map(e=>[e.id,e.source,e.target,e.data?.kind]),globals:s.globals,locals:s.locals,dashboards:s.dashboards,allowed:s.allowedFields});
}
export function contextForAssistant(s:AssistantState,workspace:{id:string;title:string;revision:number}|null,canEdit:boolean):AssistantContext{
 if(!s.nodes.some(n=>n.id===s.selectedId))throw Error('Bitte zuerst einen Analyseblock auswählen.');
 const strip=({field,op,value}:Filter)=>({field,op,value});
 const filters=effectiveFilters(s.globals,s.nodes.map(n=>n.data.analysis),s.locals,s.selectedId,s.edges).map(strip);
 return {graphFormat:AI_GRAPH_FORMAT,workspaceId:workspace?.id||null,revision:workspace?.revision??null,workspaceTitle:workspace?.title||'Lokaler Entwurf',selectedId:s.selectedId,canEdit,allowedFields:s.allowedFields,
 nodes:s.nodes.map(n=>{const a=n.data.analysis,d=s.dashboards[n.id];return {id:n.id,label:a.label,kind:a.kind,metric:a.metricId||null,visualization:a.visualization||null,chartDimension:a.chartDimension||null,intervalKey:a.intervalKey||null,containerId:a.containerId||null,containerCollapsed:!!a.containerCollapsed,containerTone:a.kind==='container'?(a.containerTone||'teal'):null,position:{x:Math.round(n.position.x),y:Math.round(n.position.y)},world:worldPosition(n,s.nodes),size:assistantBlockSize(n),description:a.description||null,question:d?.question||null,localFilters:[...(a.predicate?[a.predicate]:[]),...(s.locals[n.id]||[])].map(strip),widgets:(d?.widgets||[]).map(w=>({id:w.id,type:w.type,title:w.title,metric:w.metric||null,dimension:w.dimension||null,compareDimension:w.compareDimension||null,width:w.width,target:w.target??null,intervalKey:w.intervalKey||null,distributionMeasure:w.distributionMeasure||null}))}}),
 edges:s.edges.map(e=>({source:e.source,target:e.target,kind:e.data?.kind})),filters,globalFilters:s.globals.map(strip)};
}
function baseDashboard(n:NNode):NodeDashboard{
 if(n.data.analysis.kind==='note')throw Error('Textbaustein besitzt kein eigenes KPI-Dashboard.');
 return n.data.analysis.kind==='root'&&!n.data.analysis.metricId?{question:'',widgets:[]}:standardDashboard();
}
function nextPosition(nodes:NNode[],parent:NNode){
 const p=worldPosition(parent,nodes);let x=p.x+320;
 for(const n of nodes.filter(n=>!n.data.analysis.containerId)){
  const q=worldPosition(n,nodes);const width=n.data.analysis.kind==='container'?containerSize(n.data.analysis).width:n.measured?.width??480;
  x=Math.max(x,q.x+width+100);
 }
 return {x,y:p.y+220};
}
// New groups use compact columns by default. Existing positions only change through explicit layout actions.
export function assistantBlockSize(n:NNode){const a=n.data.analysis;return a.kind==='container'?containerSize(a):a.kind==='note'?{width:n.measured?.width??320,height:n.measured?.height??280}:{width:n.measured?.width??(a.visualization&&a.visualization!=='kpi'?460:260),height:n.measured?.height??(a.visualization&&a.visualization!=='kpi'?440:190)}}
/** Pack group members only. Never change membership, filters, or analytic edges. */
function arrangeGroup(nodes:NNode[],id:string,columns:number):NNode[]{
 const group=nodes.find(n=>n.id===id);
 if(!group||group.data.analysis.kind!=='container')throw Error('Anordnung nur für Container verfügbar.');
 if(group.data.analysis.containerCollapsed)throw Error('Container zuerst öffnen.');
 const members=nodes.filter(n=>n.data.analysis.containerId===id);
 if(!members.length)return nodes;
 const widths=Array.from({length:columns},(_,i)=>Math.max(0,...members.filter((_,j)=>j%columns===i).map(n=>assistantBlockSize(n).width)));
 const positions=new Map<string,{x:number;y:number}>();let y=86;
 for(let i=0;i<members.length;i+=columns){const row=members.slice(i,i+columns);let x=18;
  row.forEach((n,j)=>{positions.set(n.id,{x,y});x+=widths[j]+24});
  y+=Math.max(...row.map(n=>assistantBlockSize(n).height))+24;
 }
 return changeContainerSettings(nodes.map(n=>positions.has(n.id)?{...n,position:positions.get(n.id)!}:n),id,{containerWidth:320,containerHeight:160});
}
function layoutNewBlocks(nodes:NNode[],created:Map<string,string>):NNode[]{
 let out=[...nodes];
 for(const group of out.filter(n=>created.has(n.id)&&n.data.analysis.kind==='container')){
  out=arrangeGroup(out,group.id,2);
 }
 const occupied=out.filter(n=>!created.has(n.id)&&!n.data.analysis.containerId).map(n=>({...n.position,...assistantBlockSize(n)}));
 for(const [id,parentId] of created){const n=out.find(x=>x.id===id),parent=out.find(x=>x.id===parentId);if(!n||!parent||n.data.analysis.containerId)continue;
  const anchor=parent.data.analysis.containerId?out.find(x=>x.id===parent.data.analysis.containerId)||parent:parent;
  const p=worldPosition(anchor,out),ps=assistantBlockSize(anchor),s=assistantBlockSize(n);let x=p.x,y=p.y+ps.height+110;
  // Search a free rectangle, respecting existing and already placed generated blocks.
  for(let attempt=0;attempt<=occupied.length;attempt++){const hit=occupied.find(r=>x<r.x+r.width+70&&x+s.width+70>r.x&&y<r.y+r.height+70&&y+s.height+70>r.y);if(!hit)break;x=hit.x+hit.width+70;}
  out=out.map(v=>v.id===id?{...v,position:{x,y}}:v);occupied.push({x,y,...s});
 }
 return out;
}
function visualPatch(op:AiAction):Partial<AnalysisNode>{
 const viz=(op.widgetType||'kpi') as GraphViz;
 const metric=op.metric||(['bar','line'].includes(viz)?'onTimeRate':['pareto','treemap','waterfall'].includes(viz)?'totalPenaltyEur':'otifRate');
 return {metricId:metric,chartMetric:['bar','line'].includes(viz)?metric:undefined,visualization:viz,chartDimension:op.dimension?op.dimension as FieldKey:undefined,intervalKey:viz==='process_interval'?op.value as E02IntervalKey:undefined,calculationTemplate:undefined,rateEurPerKg:undefined};
}
function intersects(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number}){
 return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
}
function validateLayout(before:NNode[],after:NNode[]){
 const rect=(n:NNode)=>({...n.position,...assistantBlockSize(n)});
 const prior=new Map(before.map(n=>[n.id,n]));
 for(let i=0;i<after.length;i++)for(let j=i+1;j<after.length;j++){
  const a=after[i],b=after[j];if(a.data.analysis.containerId!==b.data.analysis.containerId)continue;
  if(!intersects(rect(a),rect(b)))continue;
  const x=prior.get(a.id),y=prior.get(b.id);
  if(x&&y&&x.data.analysis.containerId===y.data.analysis.containerId&&intersects(rect(x),rect(y)))continue;
  throw Error('Layout würde „'+a.data.analysis.label+'“ und „'+b.data.analysis.label+'“ überlappen. Bitte andere Position wählen.');
 }
}
const dimensionTypes=['bar','table','bar_horizontal','bar_vertical','stacked','stacked100','heatmap','pareto','scatter','treemap'];
const selectableMetricTypes=['kpi','bar','line','bar_horizontal','bar_vertical','bullet'];
export function applyAssistantPlan(state:AssistantState,raw:AiPlan):AssistantState{
 const plan=validatePlan(raw,state.nodes.map(n=>n.id),state.allowedFields);
 let nodes=[...state.nodes],edges=[...state.edges],locals={...state.locals},dashboards={...state.dashboards};
 const refs=new Map(nodes.map(n=>[n.id,n.id]));const changed=new Set<string>();const created=new Map<string,string>();const layoutOps:AiAction[]=[];const findingSources=new Map<string,string>();
 const get=(target:string)=>{const id=refs.get(target);const n=nodes.find(n=>n.id===id);if(!n)throw Error('Zielknoten nicht vorhanden.');return n};
 const patchNode=(id:string,patch:Partial<AnalysisNode>)=>{nodes=nodes.map(n=>n.id===id?{...n,data:{...n.data,analysis:{...n.data.analysis,...patch}}}:n);changed.add(id)};
 const updateDashboard=(n:NNode,fn:(d:NodeDashboard)=>NodeDashboard)=>{
  const d=dashboards[n.id]||baseDashboard(n),next=normalizeDashboard(fn(d));
  if(!next)throw Error('Dashboard-Konfiguration ungültig oder maximal 24 Widgets überschritten.');
  dashboards={...dashboards,[n.id]:next};
 };
 for(const op of plan.operations){
  const n=get(op.target),id=n.id,a=n.data.analysis;
  switch(op.kind){
   case 'move_node':case 'set_container_style':case 'resize_container':case 'arrange_container':layoutOps.push(op);break;
   case 'set_node_visualization':{
    if(a.kind==='container'||a.kind==='note')throw Error('Container oder Textblöcke können nicht in Diagramme umgewandelt werden.');
    patchNode(id,visualPatch(op));nodes=nodes.map(x=>x.id===id?{...x,measured:undefined,width:undefined,height:undefined}:x);
    if(a.containerId)nodes=changeContainerSettings(nodes,a.containerId,{});break;
   }
   case 'rename_node':patchNode(id,{label:op.label!});break;
   case 'set_node_metric':
    if(a.kind==='note'||a.kind==='container')throw Error('Container und Textbausteine sind keine KPI-Karten.');
    patchNode(id,{metricId:op.metric!,visualization:'kpi'});break;
   case 'add_finding':{
    if(a.kind==='note')throw Error('Finding benötigt eine Analysequelle.');if(nodes.length>=300||edges.length>=400)throw Error('Knoten- oder Kantenlimit erreicht.');
    const existing=nodes.find(x=>x.data.analysis.kind==='note'&&x.data.analysis.finding?.sourceId===id&&x.data.analysis.label===op.label&&x.data.analysis.description===op.value);
    if(existing){refs.set(op.ref!,existing.id);break;}
    const newId='ai:'+crypto.randomUUID(),analysis:AnalysisNode={id:newId,parentId:null,label:op.label!,kind:'note',createdBy:'user',description:op.value!};
    nodes.push(nodeFor(analysis,nextPosition(nodes,n)));refs.set(op.ref!,newId);created.set(newId,id);edges.push(annotationEdge(id,newId));findingSources.set(newId,id);changed.add(newId);break;
   }
   case 'edit_finding':{
    if(a.kind!=='note')throw Error('Nur Textbausteine können als Finding bearbeitet werden.');patchNode(id,{description:op.value!,...(op.label?{label:op.label}: {})});if(a.finding)findingSources.set(id,a.finding.sourceId);break;
   }
   case 'add_reference':{
    const dest=get(op.value!);if(edges.some(e=>e.source===id&&e.target===dest.id&&e.data?.kind==='annotation'))break;
    if(edges.length>=400||!isValidAnnotation(id,dest.id,edges,nodes))throw Error('Ungültige Referenz.');edges.push(annotationEdge(id,dest.id));break;
   }
   case 'set_question':updateDashboard(n,d=>({...d,question:op.label!}));break;
   case 'add_widget':{
    const type=op.widgetType as WidgetType,w=freshWidget(type);
    w.title=op.label!;
    if(op.metric&&selectableMetricTypes.includes(type))w.metric=op.metric as MetricKey;
    if(op.dimension&&dimensionTypes.includes(type))w.dimension=op.dimension as FieldKey;
    if(type==='heatmap'&&op.compareDimension)w.compareDimension=op.compareDimension as FieldKey;
    if(type==='bullet')w.target=op.targetValue!;
    if(type==='text'&&op.value)w.text=op.value;
    if(type==='histogram'&&op.value){if(!['quantity_change_count','lateness_days'].includes(op.value))throw Error('Ungültige Verteilung.');w.distributionMeasure=op.value as typeof w.distributionMeasure;}
    if(type==='e02_distribution'&&op.value)w.intervalKey=op.value as typeof w.intervalKey;
    if((w.dimension&&!state.allowedFields.includes(w.dimension))||(w.compareDimension&&!state.allowedFields.includes(w.compareDimension))||(w.compareDimension&&w.compareDimension===w.dimension))throw Error('Widget verwendet nicht freigegebene oder widersprüchliche Dimensionen.');
    if(type==='bullet'&&!['otifRate','onTimeRate','volumeConformanceRate'].includes(w.metric||''))throw Error('Bullet benötigt eine Prozent-Kennzahl.');
    if(['bar','line','bar_horizontal','bar_vertical'].includes(type)&&w.metric&&!AI_SEGMENT_METRICS.some(k=>k===w.metric))throw Error('Kennzahl für Segmentvergleich nicht unterstützt.');
    updateDashboard(n,d=>({...d,widgets:[...d.widgets,w]}));break;
   }
   case 'remove_widget':
   case 'rename_widget':updateDashboard(n,d=>{
    if(!d.widgets.some(w=>w.id===op.widgetId))throw Error('Widget nicht mehr vorhanden.');
    return {...d,widgets:op.kind==='remove_widget'?d.widgets.filter(w=>w.id!==op.widgetId):d.widgets.map(w=>w.id===op.widgetId?{...w,title:op.label!}:w)};
   });break;
   case 'add_filter':{
    const f:Filter={id:crypto.randomUUID(),field:op.field as FieldKey,op:(op.widgetType||'eq') as Filter['op'],value:actionFilterValue(op),scope:'local'};
    if(effectiveFilters(state.globals,nodes.map(n=>n.data.analysis),locals,id,edges).some(x=>x.field===f.field&&x.op===f.op&&JSON.stringify(x.value)===JSON.stringify(f.value)))break;
    locals={...locals,[id]:validateFilters([...(locals[id]||[]),f])};changed.add(id);break;
   }
   case 'add_branch':
   case 'add_container':{
    const isGroup=op.kind==='add_container',standalone=isGroup?op.value==='standalone':op.field==='standalone';
    const member=!isGroup&&(op.field==='member'||(op.field===null&&a.kind==='container'));
    if(member&&a.kind!=='container')throw Error('Mitglied-Platzierung benötigt einen Container als Ziel.');
    // Groups are always top-level layout objects. A group-to-group arrow is an
    // analytical dependency, not containment. Never discard the parent's filters.
    if(member&&a.containerCollapsed)throw Error('Container zuerst öffnen.');
    if(nodes.length>=300)throw Error('Maximal 300 Knoten.');
    const newId='ai:'+crypto.randomUUID(),analysis:AnalysisNode={id:newId,parentId:null,label:op.label!,kind:isGroup?'container':'metric',createdBy:'user',...(isGroup?{containerTone:'teal' as const}:visualPatch(op))};
    nodes.push(nodeFor(analysis,nextPosition(nodes,n)));refs.set(op.ref!,newId);created.set(newId,id);
    dashboards[newId]={question:'',widgets:[]};
    if(standalone){/* Independent group: only workspace global filters apply. */}
    else if(member)nodes=moveIntoContainer(nodes,edges,newId,id);
    else{if(edges.length>=400||!isValidReference(id,newId,edges,nodes))throw Error('Ungültige Verbindung oder Kantenlimit.');edges.push(referenceEdge(id,newId));}
    changed.add(newId);break;
   }
  }
 }
 // Check the full downstream impact; reject invalid or contradictory conditions rather than silently overriding.
 if(created.size)nodes=layoutNewBlocks(nodes,created);
 for(const op of layoutOps){
  const n=get(op.target),a=n.data.analysis;
  if(op.kind==='move_node'){
   const pos=coordinatePair(op.value,-100000,100000,-100000,100000)!;
   if(a.containerId&&(pos.x<18||pos.y<86))throw Error('Position innerhalb eines Containers benötigt x≥18, y≥86.');
   nodes=nodes.map(x=>x.id===n.id?{...x,position:pos}:x);
   if(a.containerId)nodes=changeContainerSettings(nodes,a.containerId,{});
  }else{
   if(a.kind!=='container')throw Error('Diese Gestaltung ist nur für Container verfügbar.');
   if(op.kind==='set_container_style')nodes=changeContainerSettings(nodes,n.id,{containerTone:op.value as ContainerTone});
   if(op.kind==='resize_container'){
    const size=coordinatePair(op.value,320,4000,160,4000)!;
    if(a.containerCollapsed)throw Error('Container zuerst öffnen.');
    nodes=changeContainerSettings(nodes,n.id,{containerWidth:size.x,containerHeight:size.y});
   }
   if(op.kind==='arrange_container')nodes=arrangeGroup(nodes,n.id,Number(op.value));
  }
 }
 if(layoutOps.some(o=>o.kind!=='set_container_style')||plan.operations.some(o=>o.kind==='set_node_visualization'))validateLayout(state.nodes,nodes);
 const topology=nodes.map(n=>n.data.analysis);
 if(plan.operations.some(o=>o.kind==='add_filter'||o.kind==='add_branch'||o.kind==='add_container')){
  for(const n of nodes){
   let affected=changed.has(n.id);
   if(!affected){const queue=[n.id],seen=new Set<string>();while(queue.length&&!affected){const at=queue.pop()!;if(seen.has(at))continue;seen.add(at);if(changed.has(at)){affected=true;break}for(const e of edges)if(e.target===at&&e.data?.kind!=='annotation')queue.push(e.source);const member=nodes.find(x=>x.id===at)?.data.analysis.containerId;if(member)queue.push(member)}}
   if(affected){const fs=effectiveFilters(state.globals,topology,locals,n.id,edges);if(conflictingFields(fs).length)throw Error('Filterkonflikt im Zielzweig: '+n.data.analysis.label);}
  }
 }
 for(const [id,sourceId] of findingSources)patchNode(id,{finding:findingStamp(sourceId,nodes,edges,state.globals,locals)});
 const result={...state,nodes,edges,locals,dashboards};
 const document=makeDocument(serializeDraft(nodes,edges,locals,{x:0,y:0,zoom:1}),state.globals,dashboards);
 if(new TextEncoder().encode(JSON.stringify(document)).length>500000)throw Error('Workspace-Dokument zu groß.');
 return result;
}
export function actionLabel(op:AiAction,labels:Record<string,string>){
 const t=labels[op.target]||op.target;
 switch(op.kind){
  case 'add_branch':return (op.widgetType&&op.widgetType!=='kpi'?'Visualisierung '+op.widgetType:'Analysezweig')+' „'+op.label+'“'+(op.field==='standalone'?' frei auf der Fläche':op.field==='direct'?' außerhalb von Gruppen, verbunden mit '+t:op.field==='member'?' im Container '+t:' unter '+t);
  case 'add_container':return 'Eigenständiger Container „'+op.label+'“'+(op.value==='standalone'?' ohne eingehenden Filterpfeil':' mit Filterverbindung von '+t);
  case 'add_widget':return 'Block „'+op.label+'“ in '+t+' hinzufügen';
  case 'rename_node':return t+' → „'+op.label+'“';
  case 'set_question':return 'Forschungsfrage in '+t+': '+op.label;
  case 'add_filter':return 'Filter '+op.field+' '+(op.widgetType||'=')+' '+op.value+' auf '+t;
  case 'add_finding':return 'Finding „'+op.label+'“ mit Bezug auf '+t+' erstellen';
  case 'edit_finding':return 'Finding „'+t+'“ aktualisieren';
  case 'add_reference':return 'Referenz von '+t+' zu '+(labels[op.value||'']||op.value)+' (ohne Filtervererbung)';
  case 'remove_widget':return 'Widget '+(labels[op.widgetId||'']||op.widgetId)+' aus '+t+' entfernen';
  case 'rename_widget':return 'Widget in '+t+' umbenennen: '+op.label;
  case 'move_node':return t+' verschieben · Position '+op.value;
  case 'resize_container':return t+' vergrößern/verkleinern · '+op.value+' px (mind. Platz für Mitglieder)';
  case 'set_container_style':return t+' · Farbe '+({teal:'NXT Türkis',slate:'Schiefergrau',sand:'Sand'}[op.value as ContainerTone]||op.value);
  case 'arrange_container':return t+' · '+op.value+' Spalten';
  case 'set_node_visualization':return t+' · Visualisierung '+op.widgetType;
  case 'set_node_metric':return 'Kennzahl in '+t+': '+(METRIC_LABELS[op.metric as MetricKey]||op.metric);
 }
}
export function localAssistantPlan(prompt:string,s:AssistantState,metrics:Metrics|null,canEdit:boolean,template?:'dashboard'|'path'|'new_dashboard'):AiPlan{
 const n=s.nodes.find(x=>x.id===s.selectedId);if(!n)throw Error('Knoten fehlt.');
 const id=n.id,allowed=new Set(s.allowedFields);
 const q=prompt.toLowerCase();
 const actions:AiAction[]=[];
 const add=(target:string,widgetType:WidgetType,label:string,extra:Partial<AiAction>={})=>actions.push(action('add_widget',target,{widgetType,label,...extra}));
 if(canEdit&&(template==='path'||/thinking.?path|analysepfad|analysebaum/.test(q))){
  // A known, reusable analysis scaffold; never claim this is an inferred cause.
  if(n.data.analysis.kind==='root'&&!n.data.analysis.metricId)actions.push(action('set_node_metric',id,{metric:'otifRate'}));
  const container=n.data.analysis.kind==='container'&&!n.data.analysis.containerCollapsed?id:'new:performance';
  if(container!==id)actions.push(action('add_container',id,{ref:container,label:'Performance Breakdown'}));
  actions.push(action('add_branch',container,{ref:'new:delivery',label:'Lieferqualität',metric:'onTimeRate',widgetType:'line',field:'member'}));
  actions.push(action('set_question','new:delivery',{label:'Wie unterscheiden sich pünktliche und verspätete Lieferungen?'}));
  add('new:delivery','kpi','On-Time Delivery',{metric:'onTimeRate'});add('new:delivery','line','On-Time im Zeitverlauf');
  if(allowed.has('factory'))add('new:delivery','bar_vertical','On-Time je Werk',{metric:'onTimeRate',dimension:'factory'});
  actions.push(action('add_branch',container,{ref:'new:volume',label:'Mengenkonformität',metric:'volumeConformanceRate',widgetType:'kpi',field:'member'}));
  actions.push(action('set_question','new:volume',{label:'Welche Segmente tragen zu Mengenabweichungen bei?'}));
  add('new:volume','kpi','Mengenkonformität',{metric:'volumeConformanceRate'});
  if(allowed.has('factory'))add('new:volume','bar_vertical','Mengenkonformität je Werk',{metric:'volumeConformanceRate',dimension:'factory'});
  actions.push(action('add_branch',id,{ref:'new:intervals',label:'Durchlaufzeit · Auftrag bis Lieferung',metric:'otifRate',widgetType:'process_interval',value:'order_to_delivery',field:'direct'}));
  actions.push(action('set_question','new:intervals',{label:'Welche Prozessintervalle unterscheiden OTIF- von Nicht-OTIF-Aufträgen?'}));
  add('new:intervals','e02_compare','OTIF vs. Nicht-OTIF');add('new:intervals','e02_quality','Datenqualität');
  return {answer:'Lokale, fachlich definierte Analysevorlage. Sie ergänzt Lieferqualität, Mengenabweichungen und Prozessintervalle. Die KPIs werden nach Übernahme mit den vererbten Filtern live berechnet; dies ist noch keine KI-basierte Ursachenfeststellung.',operations:actions};
 }
 if(canEdit&&(template==='dashboard'||template==='new_dashboard'||/dashboard.*(erstell|ergänz|generier|vorbereit)|erstelle.*dashboard/.test(q))){
  if(n.data.analysis.kind==='note')throw Error('Bitte einen Analyse- oder Containerknoten auswählen.');
  if(n.data.analysis.kind==='root'&&!n.data.analysis.metricId)actions.push(action('set_node_metric',id,{metric:'otifRate'}));
  actions.push(action('set_question',id,{label:'Welche Segmente und Prozessmerkmale erklären die beobachtete OTIF-Lücke?'}));
  const existing=s.dashboards[id]||baseDashboard(n);
  const reset=template==='new_dashboard';
  if(reset)for(const w of existing.widgets)actions.push(action('remove_widget',id,{widgetId:w.id}));
  const retained=reset?[]:existing.widgets;
  for(const metric of ['otifRate','onTimeRate','volumeConformanceRate','totalPenaltyEur','orders'] as const)if(!retained.some(w=>w.type==='kpi'&&w.metric===metric))add(id,'kpi',METRIC_LABELS[metric],{metric});
  if(allowed.has('factory')&&!retained.some(w=>w.type==='bar_vertical'&&w.dimension==='factory'))add(id,'bar_vertical','OTIF je Werk',{metric:'otifRate',dimension:'factory'});
  if(!retained.some(w=>w.type==='e02_quality'))add(id,'e02_quality','Abdeckung der Prozessintervalle');
  if(!retained.some(w=>w.type==='line'))add(id,'line','On-Time Delivery im Zeitverlauf');
  if(allowed.has('factory')&&allowed.has('product_type')&&!retained.some(w=>w.type==='heatmap'))add(id,'heatmap','OTIF je Werk × Produkttyp',{dimension:'factory',compareDimension:'product_type'});
  if(!retained.some(w=>w.type==='e02_compare'))add(id,'e02_compare','Prozessintervalle: OTIF vs. Nicht-OTIF');
  if(!retained.some(w=>w.type==='waterfall'))add(id,'waterfall','Modellierte Vertragsstrafe nach Ursache');
  // At most 30 actions and 24 dashboard widgets. Existing dashboard is never silently truncated.
  if(actions.length>30)throw Error('Zu viele Blöcke für einen Vorschlag. Bitte kleinere Änderungen anfragen.');
  return {answer:reset?'Lokale Dashboard-Neugestaltung: bestehende Widgets dieses Knotens werden erst bei Übernahme ersetzt.':'Lokale Dashboard-Vorlage: vorhandene Blöcke bleiben erhalten. Fehlende Kennzahlen, Segmentvergleiche und Datenqualität werden ergänzt.',operations:actions};
 }
 const k=n.data.analysis.metricId==='otd'?'onTimeRate':n.data.analysis.metricId;
 const def=k&&METRICS.includes(k as MetricKey)?KPI_DEFINITIONS[k as MetricKey]:null;
 const filters=effectiveFilters(s.globals,s.nodes.map(x=>x.data.analysis),s.locals,id,s.edges);
 const metricText=metrics?' Aktuelle Auswahl: '+metrics.orders.toLocaleString('de-DE')+' Aufträge; OTIF '+(metrics.otifRate==null?'nicht bewertbar':metrics.otifRate.toLocaleString('de-DE',{maximumFractionDigits:2})+' %')+'.':' Keine aktuellen Kennzahlen verfügbar.';
 return {answer:'Lokaler Wissensmodus · '+n.data.analysis.label+'. '+(def?def.formula+'. Nenner: '+def.denominator+'. Ausschlüsse: '+def.exclusions+'. ':'')+'Filter: '+(filters.length?filters.map(f=>formatFilter(f)).join('; '):'keine')+'.'+metricText+' Für freie Rückfragen und dynamische Vorschläge muss das KI-Modell aktiviert werden. Die Vorlagen für Dashboard und Analysepfad sind bereits verfügbar.',operations:[]};
}
