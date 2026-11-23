import React,{memo,useMemo,useRef} from 'react';
import {ReactFlow,Background,BackgroundVariant,Controls,Handle,MiniMap,Position,useReactFlow,type EdgeChange,type NodeChange,type Connection,type NodeProps,type Viewport} from '@xyflow/react';
import {DndContext,PointerSensor,KeyboardSensor,useSensor,useSensors,type DragEndEvent,useDraggable} from '@dnd-kit/core';
import type {NNode,NEdge} from '../core/graph';
import type {PaletteType} from '../core/types';
import Icon from './Icon';
import {IconButton,number,percent} from './Ui';
import {FIELD_LABELS,type FieldKey} from '../config';

function AnalyticNode({id,data,selected}:NodeProps<NNode>){
 const {analysis,onTimeRate,orders,editMode,localCount,onFilter,onSplit,onRemove,busy}=data;
 const fieldNames=data.fieldNames as Record<FieldKey,string>|undefined;
 const dark=analysis.kind==='root';
 const isNote=analysis.kind==='note';
 return <div className={'graph-node '+(dark?'root-node ':'')+(isNote?'note-node ':'')+(selected?'selected-node ':'')} tabIndex={0} role="group" aria-label={analysis.label+' – '+(orders==null?'Noch keine Kennzahl':number(orders)+' Aufträge')}>
  <Handle type="target" position={Position.Top} id="target" isConnectable={!!editMode} className="port" aria-label="Eingangsverbindung"/>
  <div className="graph-node-content"><span className="node-grip"><Icon name="grip-vertical" size={15}/></span>
   <div className="node-labels"><strong title={analysis.label}>{analysis.label}</strong>
    {dark&&<span className="root-subtitle">KPI-Analyse</span>}
    {isNote?<small>{analysis.description||'Freie Anmerkung'}</small>:<><b className="node-measure">{busy?'…':onTimeRate==null?(dark?'On-Time Delivery':'–'):percent(onTimeRate)}</b><small>{dark?'WoodCorp · Order-to-Cash':orders==null?'Noch nicht konfiguriert':number(orders)+' Aufträge'}</small></>}
   </div></div>
  {analysis.predicate&&<div className="node-dimension" title={fieldNames?.[analysis.predicate.field]||FIELD_LABELS[analysis.predicate.field]}>{fieldNames?.[analysis.predicate.field]||FIELD_LABELS[analysis.predicate.field]}</div>}
  <div className="node-buttons"><button className="node-action nodrag" type="button" title="Knotenfilter hinzufügen" aria-label={'Filter für '+analysis.label} onClick={e=>{e.stopPropagation();onFilter?.(id)}}><Icon name="filter" size={14}/>{!!localCount&&<em>{localCount}</em>}</button>
   {editMode&&<><button className="node-action nodrag" type="button" title="Nach Dimension aufgliedern" aria-label={'Aufgliederung für '+analysis.label} onClick={e=>{e.stopPropagation();onSplit?.(id)}}><Icon name="split" size={14}/></button>{analysis.createdBy==='user'&&<button className="node-action nodrag" type="button" title="Knoten entfernen" aria-label={'Knoten '+analysis.label+' entfernen'} onClick={e=>{e.stopPropagation();onRemove?.(id)}}><Icon name="trash-2" size={14}/></button>}</>}
  </div>
  <Handle type="source" position={Position.Bottom} id="source" isConnectable={!!editMode} className="port" aria-label="Ausgangsverbindung"/>
 </div>;
}
const nodeTypes={analytics:memo(AnalyticNode)};
export const paletteEntries=[
 {label:'KPI-Karte',icon:'chart-column',type:'metric' as PaletteType,enabled:true},
 {label:'Balkendiagramm',icon:'chart-bar',type:'dashboard' as const,enabled:false},
 {label:'Liniendiagramm',icon:'chart-spline',type:'dashboard' as const,enabled:false},
 {label:'Filter',icon:'filter',type:'condition' as PaletteType,enabled:true},
 {label:'Textbaustein',icon:'type',type:'note' as PaletteType,enabled:true},
 {label:'Split-Knoten',icon:'split',type:'split' as PaletteType,enabled:true},
 {label:'Connector',icon:'link',type:'connector' as PaletteType,enabled:true},
 {label:'Tabelle',icon:'table-2',type:'dashboard' as const,enabled:false},
 {label:'Donut',icon:'chart-pie',type:'dashboard' as const,enabled:false},
];
function PaletteTile({item,onAdd,onUnsupported}:{item:typeof paletteEntries[number];onAdd:(type:PaletteType)=>void;onUnsupported:()=>void}){
 const {attributes,listeners,setNodeRef,transform,isDragging}=useDraggable({id:'palette:'+item.label,disabled:!item.enabled,data:{type:item.type}});
 const style:React.CSSProperties=transform?{transform:`translate(${transform.x}px,${transform.y}px)`,zIndex:isDragging?30:undefined,opacity:isDragging?.75:undefined}:{};
 return <button ref={setNodeRef} type="button" style={style} title={item.enabled?'Klicken oder in den Canvas ziehen':'Dashboard-Komponente im Dashboard Builder bearbeiten'} className={'palette-tile '+(!item.enabled?'planned':'')} onClick={()=>item.enabled?onAdd(item.type as PaletteType):onUnsupported()} {...(item.enabled?listeners:{})} {...(item.enabled?attributes:{})}>
 <Icon name={item.icon} size={21}/><span>{item.label}</span>{!item.enabled&&<small>Dashboard</small>}</button>;
}
export function Palette({onAdd,onUnsupported,tab,setTab,enabled}:{onAdd:(type:PaletteType)=>void;onUnsupported:()=>void;tab:'builder'|'filter';setTab:(s:'builder'|'filter')=>void;enabled:boolean}){
 return <aside className="workspace-palette"><div className="palette-tabs"><button className={tab==='builder'?'active':''} onClick={()=>setTab('builder')}>Builder</button><button className={tab==='filter'?'active':''} onClick={()=>setTab('filter')}>Filter</button></div>
 {tab==='builder'?<><div className="palette-section-title">Komponenten <span>(Drag & Drop)</span><Icon name="info" size={14}/></div><div className="palette-tiles">{paletteEntries.map(item=><PaletteTile key={item.label} item={item} onAdd={enabled?onAdd:onUnsupported} onUnsupported={onUnsupported}/>)}</div><div className="palette-foot">{enabled?'Bearbeitungsmodus aktiv · Ziehe eine Komponente in den Baum.':'Analysemodus · Zum Bearbeiten Modus wechseln.'}</div></>:<div className="palette-filter"><p>Dimensionen für globale und lokale Filter können über die Filterleiste oder den Filter-Button eines Knotens gewählt werden.</p><p className="muted">Verifizierte Startdimensionen: Werk, Produkttyp, Lieferunternehmen, Lagerart, Kundenland und Lieferjahr.</p></div>}
 </aside>;
}
export interface CanvasProps{
 nodes:NNode[];edges:NEdge[];onNodesChange:(changes:NodeChange<NNode>[])=>void;onEdgesChange:(changes:EdgeChange<NEdge>[])=>void;onConnect:(connection:Connection)=>void;
 onSelect:(id:string)=>void;onSelectionClear:()=>void;selectedId:string;editMode:boolean;onEditToggle:()=>void;onFilter:(id:string)=>void;onSplit:(id:string)=>void;onRemove:(id:string)=>void;
 onAdd:(type:PaletteType,pos:{x:number;y:number})=>void;onSave:()=>void;onReset:()=>void;onGraphMove:()=>void;onGraphStart:()=>void;onUndo:()=>void;onRedo:()=>void;
 onViewportChange:(v:Viewport)=>void;fieldNames:Record<FieldKey,string>;fullscreen:boolean;setFullscreen:(v:boolean)=>void;canEdit:boolean;dirty:boolean;onHelp:()=>void;
}
export function CanvasWithFlow({nodes,edges,onNodesChange,onEdgesChange,onConnect,onSelect,onSelectionClear,selectedId,editMode,onEditToggle,onFilter,onSplit,onRemove,onAdd,onSave,onReset,onGraphMove,onGraphStart,onUndo,onRedo,onViewportChange,fieldNames,fullscreen,setFullscreen,canEdit,dirty,onHelp}:CanvasProps){
 const flow=useReactFlow<NNode,NEdge>();const canvasRef=useRef<HTMLDivElement>(null);const [tab,setTab]=React.useState<'builder'|'filter'>('builder');const [showPalette,setShowPalette]=React.useState(true);const [showMap,setShowMap]=React.useState(false);const [zoom,setZoom]=React.useState(100);const [tool,setTool]=React.useState<'select'|'pan'|'connect'>('select');
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:8}}),useSensor(KeyboardSensor));
 const addNearCenter=(type:PaletteType)=>{const bounds=canvasRef.current?.getBoundingClientRect();if(!bounds)return;const pos=flow.screenToFlowPosition({x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2});onAdd(type,pos);};
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
 const enriched=useMemo(()=>nodes.map(n=>({...n,draggable:editMode,connectable:editMode,data:{...n.data,fieldNames,editMode,onFilter,onSplit,onRemove}})),[nodes,fieldNames,editMode,onFilter,onSplit,onRemove]);
 return <DndContext sensors={sensors} onDragEnd={onDragEnd}><div className={'canvas-stack '+(fullscreen?'fullscreen-active':'')}>
  {showPalette&&!fullscreen&&<Palette tab={tab} setTab={setTab} enabled={editMode} onAdd={addNearCenter} onUnsupported={onHelp}/>}
  <section className="canvas-panel" ref={canvasRef} aria-label="Interaktiver Decision Tree Canvas"><div className="canvas-title"><div><Icon name="network" size={20}/><strong>Decision Tree</strong><span className="canvas-status">{dirty?'● Nicht gespeichert':'● Lokaler Entwurf'}</span></div>
  <div><IconButton name={showPalette?'panel-left-close':'panel-left-open'} title={showPalette?'Builder ausblenden':'Builder einblenden'} onClick={()=>setShowPalette(v=>!v)}/><button className="nxt-button secondary small" onClick={toggleFullscreen}><Icon name={fullscreen?'minimize':'maximize'} size={17}/>{fullscreen?'Schließen':'Fullscreen'}</button></div></div>
  <div className="flow-area"><ReactFlow<NNode,NEdge> nodes={enriched} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_,n)=>onSelect(n.id)} onPaneClick={onSelectionClear} onNodeDragStart={onGraphStart} onNodeDragStop={onGraphMove}
   onMoveEnd={(_,v)=>onViewportChange(v)} fitView fitViewOptions={{padding:.18,minZoom:.32,maxZoom:1}} minZoom={.25} maxZoom={2.5} snapToGrid={editMode} snapGrid={[10,10]} nodesConnectable={editMode} nodesDraggable={editMode} edgesFocusable={true} elementsSelectable={true} proOptions={{hideAttribution:false}} onlyRenderVisibleElements deleteKeyCode={null}
   panOnDrag={tool==='pan'?[0,1]:[1]}  zoomOnScroll zoomOnPinch zoomOnDoubleClick={false} selectionOnDrag={false} colorMode="light">
   <Background variant={BackgroundVariant.Dots} gap={19} size={1.2} color="#E0E9EB"/>
   <Controls showZoom={false} showFitView={false} showInteractive={false} position="bottom-right"/>
   {showMap&&<MiniMap nodeStrokeColor="#008B92" nodeColor={n=>n.id==='root:otd'?'#004C52':'#E6F5F5'} maskColor="#EFFAFA99" pannable zoomable/>}
   </ReactFlow>
   <div className="canvas-toolbar"><IconButton name="hand" title="Pan-Werkzeug aktivieren" active={tool==='pan'} onClick={()=>setTool('pan')}/><IconButton name="mouse-pointer-2" title="Auswahlwerkzeug aktivieren" active={tool==='select'} onClick={()=>setTool('select')}/><IconButton name="cable" title="Connector-Werkzeug aktivieren" active={tool==='connect'} onClick={()=>{if(!editMode){onHelp();return;}setTool('connect')}}/><IconButton name="trash-2" title="Ausgewählten selbst erstellten Knoten entfernen" onClick={()=>onRemove(selectedId)} disabled={!editMode||nodes.find(n=>n.id===selectedId)?.data.analysis.createdBy!=='user'}/><span className="toolbar-separator"/>
    <button type="button" className="tool-mode" aria-pressed={editMode} disabled={!canEdit} onClick={onEditToggle}>{editMode?'Bearbeitung aktiv':'Bearbeiten'}</button>{editMode&&<><IconButton name="undo-2" title="Änderung rückgängig" onClick={onUndo}/><IconButton name="redo-2" title="Wiederholen" onClick={onRedo}/><IconButton name="save" title="Entwurf auf diesem Gerät speichern" onClick={onSave}/></>}
   </div>
   <div className="zoom-toolbar"><IconButton name="scan" title="Alles einpassen" onClick={()=>flow.fitView({padding:.2,duration:250})}/><IconButton name="zoom-out" title="Verkleinern" onClick={()=>flow.zoomOut({duration:180})}/><b>{zoom}%</b><IconButton name="zoom-in" title="Vergrößern" onClick={()=>flow.zoomIn({duration:180})}/><IconButton name="map" title="Minimap ein-/ausblenden" active={showMap} onClick={()=>setShowMap(v=>!v)}/><IconButton name="refresh-cw" title="Startansicht wiederherstellen (nur Kamera)" onClick={()=>flow.fitView({padding:.2,duration:250})}/></div>
  </div></section>
 </div></DndContext>;
}