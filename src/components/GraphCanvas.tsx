import React,{memo,useMemo,useRef} from 'react';
import {ReactFlow,Background,BackgroundVariant,Controls,Handle,MiniMap,Position,useReactFlow,type EdgeChange,type NodeChange,type Connection,type NodeProps,type Viewport} from '@xyflow/react';
import {DndContext,PointerSensor,KeyboardSensor,useSensor,useSensors,type DragEndEvent,useDraggable} from '@dnd-kit/core';
import {orderedNodes,containerLayout,resizeGraphCard,worldPosition,type NNode,type NEdge} from '../core/graph';
import {SmartLayoutDialog} from './SmartLayoutDialog';
import {ResizeGrip} from './ResizeGrip';
import {cardDimensions,type CardSize} from '../core/cardLayout';
import {findingStatus} from '../core/findings';
import type {Filter,PaletteType} from '../core/types';
import Icon from './Icon';
import {GraphNodeVisual} from './GraphNodeVisual';
import {IconButton,number,percent} from './Ui';
import {FIELD_LABELS,type FieldKey} from '../config';
import {ChartAccess} from './InteractiveCharts';
import {canvasWidgetFor} from '../core/analyticsCanvas';
import {WIDGET_TYPES,WIDGET_LABELS,WIDGET_ICONS,metricFormat,type DashboardWidget,type NodeDashboard,type MetricKey} from '../core/dashboard';

function AnalyticNode({id,data,selected}:NodeProps<NNode>){
 const {analysis,onTimeRate,orders,editMode,localCount,onFilter,onSplit,onRemove,onConfigure,busy}=data;
 const access=React.useContext(ChartAccess),onFocus=data.onFocus as ((id:string)=>void)|undefined,onDetails=data.onDetails as ((id:string)=>void)|undefined,onArea=data.onAreaFilter as ((id:string,field:FieldKey,value:string)=>void)|undefined,onCreateBranch=data.onCreateBranch as ((id:string,field:FieldKey,value:string)=>void)|undefined,onUpdate=data.onUpdateWidget as ((nodeId:string,widgetId:string,patch:Partial<DashboardWidget>)=>void)|undefined;
 const onResearch=data.onResearch as ((id:string)=>void)|undefined;
 const chosen=(analysis.metricId==='otd'?'onTimeRate':analysis.metricId||'otifRate') as MetricKey;
 const mainValue=data.primaryValue===undefined?onTimeRate:data.primaryValue;
 const fieldNames=data.fieldNames as Record<FieldKey,string>|undefined;
 const resizePreview=data.onResizePreview as ((id:string,size:CardSize|null)=>void)|undefined,resizeCommit=data.onResizeCard as ((id:string,size:CardSize|null)=>void)|undefined,getScale=data.resizeZoom as (()=>number)|undefined;
 const grip=editMode&&resizeCommit&&resizePreview?<ResizeGrip label={analysis.label} getScale={getScale} onPreview={size=>resizePreview(id,size)} onCommit={size=>resizeCommit(id,size)}/>:null;
 if(analysis.kind==='container'){
  const count=Number(data.memberCount||0);
  const onToggle=data.onToggleContainer as ((id:string)=>void)|undefined;
  return <div className={'nxt-container-node tone-'+(analysis.containerTone||'teal')+(selected?' selected-container':'')+(analysis.containerCollapsed?' collapsed-container':'')} data-resizable-card role="group" aria-label={analysis.label+' – '+count+' Elemente'}>
   <Handle type="target" position={Position.Top} id="target" isConnectable={!!editMode} className="port" aria-label="Container-Eingang"/>
   <div className="nxt-container-header"><Icon name="layers" size={20}/><div className="nxt-container-title"><strong title={analysis.label}>{analysis.label}</strong><small>{count} {count===1?'Element':'Elemente'} · gemeinsamer Filterkontext</small></div>
    <div className="nxt-container-actions nodrag">
     <button className="node-action nodrag" type="button" title="Containerfilter" aria-label={'Filter für '+analysis.label} onClick={e=>{e.stopPropagation();onFilter?.(id)}}><Icon name="filter" size={16}/>{!!localCount&&<em>{localCount}</em>}</button>
     {editMode&&<><button className="node-action nodrag" type="button" title="Container konfigurieren" aria-label={'Container '+analysis.label+' konfigurieren'} onClick={e=>{e.stopPropagation();onConfigure?.(id)}}><Icon name="settings" size={16}/></button><button className="node-action nodrag" type="button" title={analysis.containerCollapsed?'Container öffnen':'Container einklappen'} aria-expanded={!analysis.containerCollapsed} aria-label={analysis.containerCollapsed?'Container öffnen':'Container einklappen'} onClick={e=>{e.stopPropagation();onToggle?.(id)}}><Icon name={analysis.containerCollapsed?'maximize':'minimize'} size={16}/></button><button className="node-action nodrag" type="button" title="Container auflösen (Elemente bleiben)" aria-label="Container auflösen" onClick={e=>{e.stopPropagation();onRemove?.(id)}}><Icon name="trash-2" size={16}/></button></>}
    </div>
   </div>
   {analysis.description&&<p className="nxt-container-description">{analysis.description}</p>}
   {!analysis.containerCollapsed&&!count&&<div className="nxt-container-empty"><Icon name="square-dashed" size={32}/><strong>Elemente hier hineinziehen</strong><small>Ein Eingang · ein gemeinsamer Filterfluss</small></div>}
   {analysis.containerCollapsed&&<div className="nxt-container-folded">Inhalte eingeklappt · Filter bleiben aktiv</div>}
   {!analysis.containerCollapsed&&grip}
   <Handle type="source" position={Position.Bottom} id="source" isConnectable={!!editMode} className="port" aria-label="Container-Ausgang"/>
  </div>;
 }
 const isNote=analysis.kind==='note',graphChart=!!analysis.canvasWidgetId||!!analysis.visualization&&analysis.visualization!=='kpi',dark=analysis.kind==='root'&&!graphChart,summary=graphChart&&data.semanticOverview===true;
 const chartAccess={...access,nodeId:id,scopeLabel:analysis.containerId?'Analysebereich temporär filtern':'Knoten temporär filtern',crossFilter:onArea?(field:FieldKey,value:string)=>onArea(id,field,value):undefined,createBranch:onCreateBranch?(field:FieldKey,value:string)=>onCreateBranch(id,field,value):undefined,saveView:editMode&&onUpdate?(widgetId:string,patch:Partial<DashboardWidget>)=>onUpdate(id,widgetId,patch):undefined};
 return <div data-resizable-card style={{'--nxt-plot-height':Math.max(120,cardDimensions(analysis).height-165)+'px'} as React.CSSProperties} className={'graph-node nxt-card-shell '+(dark?'root-node ':'')+(isNote?'note-node ':'')+(graphChart?'chart-node ':'')+(selected?'selected-node ':'')} tabIndex={0} role="group" aria-label={analysis.label+' – '+(orders==null?'Noch keine Kennzahl':number(orders)+' Aufträge')}>
  <Handle type="target" position={Position.Top} id="target" isConnectable={!!editMode} className="port" aria-label="Eingangsverbindung"/>
  <header className="nxt-card-header graph-node-header">
   <div className="nxt-card-title"><span className="node-grip" aria-hidden="true"><Icon name="grip-vertical" size={15}/></span><div><strong title={analysis.label}>{analysis.label}</strong>{dark&&<small className="root-subtitle">Ausgangspunkt</small>}</div></div>
   <div className="node-buttons">
    {!isNote&&onResearch&&<button type="button" className="node-action nodrag" title="Deep Analysis · Aufträge und Prozesse untersuchen" aria-label={'Deep Analysis '+analysis.label} onClick={e=>{e.stopPropagation();onResearch(id)}}><Icon name="search" size={14}/></button>}{onFocus&&<button type="button" className="node-action nodrag" title="Kachel fokussieren" aria-label={'Fokus '+analysis.label} onClick={e=>{e.stopPropagation();onFocus(id)}}><Icon name="maximize-2" size={14}/></button>}{onDetails&&<button type="button" className="node-action nodrag" title="Optionale Detailansicht öffnen" aria-label={'Details '+analysis.label} onClick={e=>{e.stopPropagation();onDetails(id)}}><Icon name="layout-dashboard" size={14}/></button>}{!isNote&&<button type="button" className="node-action nodrag" title="Berechnungslogik anzeigen" aria-label={'Berechnungslogik für '+analysis.label} onClick={e=>{e.stopPropagation();data.onExplain?.(id)}}><Icon name="info" size={14}/></button>}
    <button className="node-action nodrag" type="button" title="Knotenfilter hinzufügen" aria-label={'Filter für '+analysis.label} onClick={e=>{e.stopPropagation();onFilter?.(id)}}><Icon name="filter" size={14}/>{!!localCount&&<em>{localCount}</em>}</button>
    {editMode&&<><button className="node-action nodrag" type="button" title="Knoten und Diagramm konfigurieren" aria-label={'Knoten '+analysis.label+' konfigurieren'} onClick={e=>{e.stopPropagation();onConfigure?.(id)}}><Icon name="settings" size={14}/></button>{!isNote&&<button className="node-action nodrag" type="button" title="Nach Dimension aufgliedern" aria-label={'Aufgliederung für '+analysis.label} onClick={e=>{e.stopPropagation();onSplit?.(id)}}><Icon name="split" size={14}/></button>}<button className="node-action nodrag" type="button" title="Knoten entfernen" aria-label={'Knoten '+analysis.label+' entfernen'} onClick={e=>{e.stopPropagation();onRemove?.(id)}}><Icon name="trash-2" size={14}/></button></>}
   </div>
  </header>
  <div className={'nxt-card-body '+(graphChart||isNote?'nxt-node-scroll nodrag nowheel':'nxt-node-kpi')}>
   {isNote?<><div className="nxt-finding-text">{analysis.description||'Freie Anmerkung'}</div>{analysis.finding&&<span className={'nxt-finding-status '+((data.findingStatus as ReturnType<typeof findingStatus>|undefined)?.state||'unverified')}>{(data.findingStatus as ReturnType<typeof findingStatus>|undefined)?.text||'Datenabgleich ausstehend'}</span>}</>:summary?<div className="nxt-semantic-summary"><Icon name={data.canvasWidget?WIDGET_ICONS[data.canvasWidget.type]:'chart-column'} size={34}/><strong>{busy?'…':number(orders)} Aufträge</strong><small>{data.canvasWidget?WIDGET_LABELS[data.canvasWidget.type]:'Visualisierung'} · zum Analysieren hineinzoomen</small>{data.error&&<small>{String(data.error)}</small>}</div>:graphChart?<ChartAccess.Provider value={chartAccess}><GraphNodeVisual data={data}/></ChartAccess.Provider>:<><b className="node-measure">{busy?'…':mainValue==null?'–':metricFormat(chosen,mainValue)}</b><small>{data.primaryLabel||'OTIF'} · {orders==null?'Noch keine Fälle':number(orders)+' Aufträge'}</small>{data.error&&<small className="node-viz-error" role="status">{String(data.error)}</small>}</>}
  </div>
  {(data.filterSummary||analysis.predicate)&&<footer className="nxt-card-footer">{data.filterSummary&&<small className="node-filter-summary" title={String(data.filterSummary)}>Filter: {String(data.filterSummary)}</small>}{analysis.predicate&&<small className="node-dimension" title={fieldNames?.[analysis.predicate.field]||FIELD_LABELS[analysis.predicate.field]}>{fieldNames?.[analysis.predicate.field]||FIELD_LABELS[analysis.predicate.field]}</small>}</footer>}
  {grip}
  <Handle type="source" position={Position.Bottom} id="source" isConnectable={!!editMode} className="port" aria-label="Ausgangsverbindung"/>
 </div>;
}
const nodeTypes={analytics:memo(AnalyticNode)};
const widgetEntry=(type:DashboardWidget['type'])=>({label:WIDGET_LABELS[type],icon:WIDGET_ICONS[type],type:('widget:'+type) as PaletteType,enabled:true});
export const paletteGroups=[
 {title:'Kennzahlen',items:[...(['kpi','bullet','status'] as const).map(widgetEntry),{label:'SQL-Kennzahl',icon:'database',type:'calculation' as PaletteType,enabled:true}]},
 {title:'Visualisierungen',items:WIDGET_TYPES.filter(t=>['bar','bar_horizontal','bar_vertical','line','donut','stacked','stacked100','heatmap','pareto','scatter','waterfall','histogram','treemap','funnel','comparison','e02_overview','e02_compare','e02_quality','e02_distribution'].includes(t)).map(widgetEntry)},
 {title:'Daten & Erkenntnisse',items:[widgetEntry('table'),widgetEntry('customer_table'),widgetEntry('research'),widgetEntry('scenario'),{label:'Finding / Hypothese',icon:'file-text',type:'note' as PaletteType,enabled:true},widgetEntry('text')]},
 {title:'Struktur',items:[{label:'Container',icon:'layers',type:'container' as PaletteType,enabled:true},{label:'Neuer Ausgangsknoten',icon:'circle-plus',type:'root' as PaletteType,enabled:true},{label:'Filter',icon:'filter',type:'condition' as PaletteType,enabled:true},{label:'Split-Knoten',icon:'split',type:'split' as PaletteType,enabled:true},{label:'Connector',icon:'link',type:'connector' as PaletteType,enabled:true}]}
];
export const paletteEntries=paletteGroups.flatMap(g=>g.items);

function PaletteTile({item,onAdd,onUnsupported}:{item:typeof paletteEntries[number];onAdd:(type:PaletteType)=>void;onUnsupported:()=>void}){
 const {attributes,listeners,setNodeRef,transform,isDragging}=useDraggable({id:'palette:'+item.label,disabled:!item.enabled,data:{type:item.type}});
 const style:React.CSSProperties=transform?{transform:`translate(${transform.x}px,${transform.y}px)`,zIndex:isDragging?30:undefined,opacity:isDragging?.75:undefined}:{};
 return <button ref={setNodeRef} type="button" style={style} title={item.enabled?'Klicken oder in den Canvas ziehen':'Dashboard-Komponente im Dashboard Builder bearbeiten'} className={'palette-tile '+(!item.enabled?'planned':'')} onClick={()=>item.enabled?onAdd(item.type as PaletteType):onUnsupported()} {...(item.enabled?listeners:{})} {...(item.enabled?attributes:{})}>
 <Icon name={item.icon} size={21}/><span>{item.label}</span>{!item.enabled&&<small>Dashboard</small>}</button>;
}
export function Palette({onAdd,onUnsupported,tab,setTab,enabled}:{onAdd:(type:PaletteType)=>void;onUnsupported:()=>void;tab:'builder'|'filter';setTab:(s:'builder'|'filter')=>void;enabled:boolean}){
 return <aside className="workspace-palette"><div className="palette-tabs"><button className={tab==='builder'?'active':''} onClick={()=>setTab('builder')}>Builder</button><button className={tab==='filter'?'active':''} onClick={()=>setTab('filter')}>Filter</button></div>
 {tab==='builder'?<><div className="palette-section-title">Komponenten <span>(Drag & Drop)</span><Icon name="info" size={14}/></div><div className="nxt-palette-groups">{paletteGroups.map(group=><details key={group.title} open={group.title!=='Struktur'||undefined}><summary>{group.title}</summary><div className="palette-tiles">{group.items.map(item=><PaletteTile key={item.type} item={item} onAdd={enabled?onAdd:onUnsupported} onUnsupported={onUnsupported}/>)}</div></details>)}</div><div className="palette-foot">{enabled?'Bearbeitungsmodus aktiv · Ziehe Komponenten in den Baum oder in einen Container.':'Analysemodus · Zum Bearbeiten Modus wechseln.'}</div></>:<div className="palette-filter"><p>Durchgezogene Filterpfeile vererben Filter in Richtung der Zielknoten. Gestrichelte Referenzen verbinden nur fachlich. Auf mehreren eingehenden Verbindungen werden die Bedingungen mit UND kombiniert.</p><p>Dimensionen für globale und lokale Filter können über die Filterleiste oder den Filter-Button eines Knotens gewählt werden.</p><p className="muted">Zusätzlich verfügbar: OTIF-Status, Lieferzeitraum, Auftragswert, Mengenbereiche und Anzahl der Prozessänderungen.</p></div>}
 </aside>;
}
export interface CanvasProps{
 nodes:NNode[];edges:NEdge[];onNodesChange:(changes:NodeChange<NNode>[])=>void;onEdgesChange:(changes:EdgeChange<NEdge>[])=>void;onConnect:(connection:Connection,mode:'filter'|'annotation')=>void;globals:Filter[];locals:Record<string,Filter[]>;onRemoveEdge:(id:string)=>void;
 onSelect:(id:string)=>void;onSelectionClear:()=>void;selectedId:string;editMode:boolean;onEditToggle:()=>void;onFilter:(id:string)=>void;onSplit:(id:string)=>void;onRemove:(id:string)=>void;onConfigure:(id:string)=>void;onExplain:(id:string)=>void;
 onAdd:(type:PaletteType,pos:{x:number;y:number})=>void;onSave:()=>void;onReset:()=>void;onGraphMove:(node:NNode)=>void;onGraphStart:()=>void;onResizeCard:(id:string,size:CardSize|null)=>void;onToggleContainer:(id:string)=>void;onUndo:()=>void;onRedo:()=>void;
 dashboards?:Record<string,NodeDashboard>;onApplyLayout?:(nodes:NNode[],stamp:string)=>void;onResearch?:(id:string)=>void;onUpdateWidget?:(nodeId:string,widgetId:string,patch:Partial<DashboardWidget>)=>void;onAreaFilter?:(id:string,field:FieldKey,value:string)=>void;onCreateBranch?:(id:string,field:FieldKey,value:string)=>void;onOpenDetails?:(id:string)=>void;onViewportChange:(v:Viewport)=>void;fieldNames:Record<FieldKey,string>;fullscreen:boolean;setFullscreen:(v:boolean)=>void;canEdit:boolean;dirty:boolean;onHelp:()=>void;
}
export function CanvasWithFlow({nodes,edges,onNodesChange,onEdgesChange,onConnect,globals,locals,onRemoveEdge,onSelect,onSelectionClear,selectedId,editMode,onEditToggle,onFilter,onSplit,onRemove,onConfigure,onExplain,onAdd,onSave,onReset,onGraphMove,onGraphStart,onResizeCard,onToggleContainer,onUndo,onRedo,dashboards={},onApplyLayout,onResearch,onUpdateWidget,onAreaFilter,onCreateBranch,onOpenDetails,onViewportChange,fieldNames,fullscreen,setFullscreen,canEdit,dirty,onHelp}:CanvasProps){
 const flow=useReactFlow<NNode,NEdge>();const canvasRef=useRef<HTMLDivElement>(null);const [tab,setTab]=React.useState<'builder'|'filter'>('builder');const [showPalette,setShowPalette]=React.useState(true);const [showMap,setShowMap]=React.useState(false);const [zoom,setZoom]=React.useState(100);const [tool,setTool]=React.useState<'select'|'pan'|'connect'>('select');
 const [layoutOpen,setLayoutOpen]=React.useState(false);
 const [semantic,setSemantic]=React.useState(true),[presentation,setPresentation]=React.useState(false),[presentIndex,setPresentIndex]=React.useState(0);
 const focus=(id:string)=>{onSelect(id);void flow.fitView({nodes:[{id}],padding:.18,duration:280,maxZoom:1.6})};
 const [resizePreview,setResizePreview]=React.useState<{id:string;size:CardSize}|null>(null);
 React.useEffect(()=>{if(!editMode)setResizePreview(null)},[editMode]);
 const [connectionMode,setConnectionMode]=React.useState<'filter'|'annotation'>('filter');
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:8}}),useSensor(KeyboardSensor));
 const addNearCenter=(type:PaletteType)=>{const bounds=canvasRef.current?.getBoundingClientRect();if(!bounds)return;const pos=flow.screenToFlowPosition({x:bounds.left+bounds.width*.68,y:bounds.top+bounds.height*.2});onAdd(type,pos);};
 const onDragEnd=(event:DragEndEvent)=>{const type=event.active.data.current?.type as PaletteType|undefined;if(!type)return;const ev=event.activatorEvent;
  let x=0,y=0;if('clientX'in ev&&'clientY'in ev&&typeof ev.clientX==='number'&&typeof ev.clientY==='number'){x=ev.clientX+event.delta.x;y=ev.clientY+event.delta.y;}else{addNearCenter(type);return;}
  const bounds=canvasRef.current?.getBoundingClientRect();if(!bounds||x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom)return;
  onAdd(type,flow.screenToFlowPosition({x,y}));
 };
 const toggleFullscreen=async()=>{const el=canvasRef.current;if(!el)return;if(document.fullscreenElement){await document.exitFullscreen();setFullscreen(false)}else{try{await el.requestFullscreen();setFullscreen(true)}catch{setFullscreen(!fullscreen)}}};
 React.useEffect(()=>{const listener=()=>setFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',listener);return()=>document.removeEventListener('fullscreenchange',listener)},[setFullscreen]);
 React.useEffect(()=>{const update=()=>setZoom(Math.round(flow.getZoom()*100));const id=setInterval(update,350);return()=>clearInterval(id)},[flow]);
 React.useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?onRedo():onUndo()}else if(e.key==='Escape'&&fullscreen){setFullscreen(false)};
 };document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[fullscreen,onUndo,onRedo,setFullscreen]);
 const collapsedGroups=new Set(nodes.filter(n=>n.data.analysis.kind==='container'&&n.data.analysis.containerCollapsed).map(n=>n.id));
 const hiddenIds=new Set(nodes.filter(n=>n.data.analysis.containerId&&collapsedGroups.has(n.data.analysis.containerId)).map(n=>n.id));
 const previewNodes=editMode&&resizePreview?resizeGraphCard(nodes,resizePreview.id,resizePreview.size):nodes;
 const slides=nodes.filter(n=>!hiddenIds.has(n.id)&&n.data.analysis.kind!=='container').sort((a,b)=>{const aa=worldPosition(a,nodes),bb=worldPosition(b,nodes);return aa.y-bb.y||aa.x-bb.x});
 const step=(i:number)=>{const idx=Math.max(0,Math.min(slides.length-1,i));setPresentIndex(idx);if(slides[idx])focus(slides[idx].id)};
 const enriched=orderedNodes(previewNodes).map(n=>({...containerLayout(n),hidden:hiddenIds.has(n.id),draggable:editMode,connectable:editMode,data:{...n.data,canvasWidget:canvasWidgetFor(n.data.analysis,dashboards),semanticOverview:semantic&&zoom<55&&n.id!==selectedId,onFocus:focus,onDetails:onOpenDetails,onResearch,onAreaFilter,onCreateBranch:canEdit?onCreateBranch:undefined,onUpdateWidget,fieldNames,editMode,resizeZoom:()=>flow.getZoom(),onResizePreview:(id:string,size:CardSize|null)=>setResizePreview(size?{id,size}:null),onResizeCard,findingStatus:n.data.analysis.kind==='note'?findingStatus(n.data.analysis,nodes,edges,globals,locals):undefined,onFilter,onSplit,onRemove,onConfigure,onExplain,onToggleContainer,memberCount:n.data.analysis.kind==='container'?nodes.filter(x=>x.data.analysis.containerId===n.id).length:undefined}}));
 const visibleEdges=edges.map(e=>({...e,hidden:hiddenIds.has(e.source)||hiddenIds.has(e.target)}));
 return <DndContext sensors={sensors} onDragEnd={onDragEnd}><div className={'canvas-stack '+(fullscreen?'fullscreen-active':'')}>
  {showPalette&&!fullscreen&&!presentation&&<Palette tab={tab} setTab={setTab} enabled={editMode} onAdd={addNearCenter} onUnsupported={onHelp}/>}
  <section className="canvas-panel" ref={canvasRef} aria-label="Interaktiver Decision Tree Canvas"><div className="canvas-title"><div><Icon name="network" size={20}/><strong>Thinking Path · Analytics Canvas</strong><span className="canvas-status">{dirty?'● Nicht gespeichert':'● Lokaler Entwurf'}</span></div>
  <div>{onApplyLayout&&<button type="button" className="nxt-button secondary small" onClick={()=>setLayoutOpen(true)}><Icon name="layout-grid" size={16}/> Smart Layout</button>}{onResearch&&<button type="button" className="nxt-button secondary small" disabled={!selectedId||nodes.find(n=>n.id===selectedId)?.data.analysis.kind==='note'} onClick={()=>onResearch(selectedId)}><Icon name="search" size={16}/> Deep Analysis</button>}<button className="nxt-button secondary small" type="button" aria-pressed={semantic} onClick={()=>setSemantic(v=>!v)}>{semantic?'Auto-Details an':'Auto-Details aus'}</button><button className="nxt-button secondary small" type="button" aria-pressed={presentation} onClick={()=>{if(presentation){setPresentation(false);void flow.fitView({padding:.2,duration:250})}else{setPresentation(true);step(0)}}}>{presentation?'Präsentation beenden':'Präsentieren'}</button><IconButton name={showPalette?'panel-left-close':'panel-left-open'} title={showPalette?'Builder ausblenden':'Builder einblenden'} onClick={()=>setShowPalette(v=>!v)}/><button className="nxt-button secondary small" onClick={toggleFullscreen}><Icon name={fullscreen?'minimize':'maximize'} size={17}/>{fullscreen?'Schließen':'Fullscreen'}</button></div></div>
  <div className="flow-area"><ReactFlow<NNode,NEdge> nodes={enriched} edges={visibleEdges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={c=>onConnect(c,connectionMode)} onNodeClick={(_,n)=>onSelect(n.id)} onNodeDoubleClick={(_,n)=>focus(n.id)} onPaneClick={onSelectionClear} onNodeDragStart={onGraphStart} onNodeDragStop={(_,node)=>onGraphMove(node)}
   onMoveEnd={(_,v)=>{setZoom(Math.round(v.zoom*100));onViewportChange(v)}} fitView fitViewOptions={{padding:.18,minZoom:.32,maxZoom:1}} minZoom={.25} maxZoom={2.5} snapToGrid={editMode} snapGrid={[10,10]} nodesConnectable={editMode} nodesDraggable={editMode} edgesFocusable={true} elementsSelectable={true} proOptions={{hideAttribution:false}} onlyRenderVisibleElements deleteKeyCode={null}
   panOnDrag={tool==='pan'?[0,1]:[1]}  zoomOnScroll zoomOnPinch zoomOnDoubleClick={false} selectionOnDrag={false} colorMode="light">
   <Background variant={BackgroundVariant.Dots} gap={19} size={1.2} color="#E0E9EB"/>
   <Controls showZoom={false} showFitView={false} showInteractive={false} position="bottom-right"/>
   {showMap&&<MiniMap nodeStrokeColor="#008B92" nodeColor={n=>n.id==='root:otd'?'#004C52':'#E6F5F5'} maskColor="#EFFAFA99" pannable zoomable/>}
   </ReactFlow>
   {presentation&&<div className="nxt-presentation-nav"><button type="button" disabled={presentIndex<=0} onClick={()=>step(presentIndex-1)}>← Zurück</button><span>{Math.min(presentIndex+1,slides.length)} / {slides.length} · {slides[presentIndex]?.data.analysis.label||'Keine Elemente'}</span><button type="button" disabled={presentIndex>=slides.length-1} onClick={()=>step(presentIndex+1)}>Weiter →</button></div>}
   <div className="canvas-toolbar"><IconButton name="hand" title="Pan-Werkzeug aktivieren" active={tool==='pan'} onClick={()=>setTool('pan')}/><IconButton name="mouse-pointer-2" title="Auswahlwerkzeug aktivieren" active={tool==='select'} onClick={()=>setTool('select')}/><IconButton name="cable" title="Connector-Werkzeug aktivieren" active={tool==='connect'} onClick={()=>{if(!editMode){onHelp();return;}setTool('connect')}}/><IconButton name="trash-2" title="Ausgewählten selbst erstellten Knoten entfernen" onClick={()=>onRemove(selectedId)} disabled={!editMode||nodes.find(n=>n.id===selectedId)?.data.analysis.createdBy!=='user'}/><span className="toolbar-separator"/>{editMode&&<><label className="nxt-connection-mode"><span>Verbindung</span><select aria-label="Verbindungstyp" value={connectionMode} onChange={e=>setConnectionMode(e.target.value as 'filter'|'annotation')}><option value="filter">Filterfluss</option><option value="annotation">Referenz (ohne Filter)</option></select></label>{edges.some(e=>e.selected)&&<button type="button" className="tool-mode" onClick={()=>{const e=edges.find(x=>x.selected);if(e)onRemoveEdge(e.id)}}>Verbindung löschen</button>}</>}
    <button type="button" className="tool-mode" aria-pressed={editMode} disabled={!canEdit} onClick={onEditToggle}>{editMode?'Bearbeitung aktiv':'Bearbeiten'}</button>{editMode&&<><IconButton name="undo-2" title="Änderung rückgängig" onClick={onUndo}/><IconButton name="redo-2" title="Wiederholen" onClick={onRedo}/><IconButton name="save" title="Entwurf auf diesem Gerät speichern" onClick={onSave}/></>}
   </div>
   <div className="zoom-toolbar"><IconButton name="scan" title="Alles einpassen" onClick={()=>flow.fitView({padding:.2,duration:250})}/><IconButton name="zoom-out" title="Verkleinern" onClick={()=>flow.zoomOut({duration:180})}/><b>{zoom}%</b><IconButton name="zoom-in" title="Vergrößern" onClick={()=>flow.zoomIn({duration:180})}/><IconButton name="map" title="Minimap ein-/ausblenden" active={showMap} onClick={()=>setShowMap(v=>!v)}/><IconButton name="refresh-cw" title="Startansicht wiederherstellen (nur Kamera)" onClick={()=>flow.fitView({padding:.2,duration:250})}/></div>
  </div></section>
  {layoutOpen&&onApplyLayout&&<SmartLayoutDialog nodes={nodes} edges={edges} globals={globals} locals={locals} dashboards={dashboards} canEdit={canEdit} onClose={()=>setLayoutOpen(false)} onApply={(proposed,stamp)=>{onApplyLayout(proposed,stamp);requestAnimationFrame(()=>requestAnimationFrame(()=>void flow.fitView({padding:.18,duration:250})))}} onFocus={focus}/>}
 </div></DndContext>;
}