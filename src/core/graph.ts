import type {Node,Edge,XYPosition} from '@xyflow/react';
import type {AnalysisNode,GraphNodeData,BreakdownRow,SavedDraft,Filter,EdgeKind} from './types';
import type {FieldKey} from '../config';
import {filterLinks} from './filters';
import {cardBounds,cardDimensions,clampSize,isValidCardDimension,type CardSize} from './cardLayout';
export type NNode=Node<GraphNodeData,'analytics'>;
export type NEdge=Edge<{kind:EdgeKind}>;
export const ROOT_ID='root:otd';
export function rootAnalysis():AnalysisNode{return {id:ROOT_ID,parentId:null,label:'OTIF · Ausgangsanalyse',kind:'root',createdBy:'system',metricId:'otifRate'};}
export function nodeFor(analysis:AnalysisNode,position:XYPosition,metrics?:{orders?:number|null;onTimeRate?:number|null}):NNode{
 return containerLayout({id:analysis.id,type:'analytics',position,data:{analysis,orders:metrics?.orders,onTimeRate:metrics?.onTimeRate},draggable:true});
}
export function semanticEdge(parent:string,child:string):NEdge{
 return {id:'analytic:'+parent+'=>'+child,source:parent,target:child,type:'smoothstep',animated:false,style:{stroke:'#008B92',strokeWidth:2},data:{kind:'analytic'}};
}
export function referenceEdge(parent:string,child:string):NEdge{
 return {id:'reference:'+crypto.randomUUID(),source:parent,target:child,type:'smoothstep',style:{stroke:'#008B92',strokeWidth:2},data:{kind:'reference'},label:'Filterfluss →'};
}
/** Purely documentary links do not participate in inheritance; existing reference edges remain filter links. */
export function annotationEdge(source:string,target:string):NEdge{return {id:'annotation:'+crypto.randomUUID(),source,target,type:'smoothstep',style:{stroke:'#707173',strokeWidth:1.8,strokeDasharray:'6 5'},data:{kind:'annotation'},label:'Referenz · ohne Filter'};}
export function isValidAnnotation(source:string,target:string,edges:NEdge[],nodes:NNode[]):boolean{return !!source&&!!target&&source!==target&&nodes.some(n=>n.id===source)&&nodes.some(n=>n.id===target)&&!edges.some(e=>e.source===source&&e.target===target&&e.data?.kind==='annotation');}
/** Fresh workspaces must NOT inherit a former workspace's graph or any factory branches. */
export function createBlankWorkspaceGraph():{nodes:NNode[];edges:NEdge[]}{
 const analysis:AnalysisNode={id:'root:workspace:'+crypto.randomUUID(),parentId:null,
  label:'Ausgangsknoten',kind:'root',createdBy:'user'};
 return {nodes:[nodeFor(analysis,{x:440,y:80})],edges:[]};
}
export function createInitialGraph(factories:BreakdownRow[],rootMetric?:{orders?:number;onTimeRate?:number|null}):{nodes:NNode[];edges:NEdge[]}{
 const root=nodeFor(rootAnalysis(),{x:500,y:70},rootMetric);
 return {nodes:[root],edges:[]};
}
export function splitGraph(nodes:NNode[],edges:NEdge[],parentId:string,field:FieldKey,rows:BreakdownRow[]):{nodes:NNode[];edges:NEdge[]}{
 const parent=nodes.find(n=>n.id===parentId);if(!parent)throw Error('Elternknoten fehlt');
 const existing=new Set(nodes.map(n=>n.id));const children=rows.filter(r=>r.label!==null).slice(0,24);
 const outNodes=[...nodes],outEdges=[...edges];
 const count=children.length;
 children.forEach((r,i)=>{
  const id='split:'+parentId+':'+field+':'+encodeURIComponent(String(r.label));
  if(existing.has(id))return;
  const a:AnalysisNode={id,parentId,label:String(r.label),kind:'segment',createdBy:'system',predicate:{id:'p:'+id,field,op:'eq',value:String(r.label),scope:'local'}};
  const pos=worldPosition(parent,nodes);const x=pos.x+(i-(count-1)/2)*240,y=pos.y+nodeLayoutSize(parent).height+74;
  outNodes.push(nodeFor(a,{x,y},{orders:Number(r.orders),onTimeRate:r.on_time_rate===null?null:Number(r.on_time_rate)}));
  outEdges.push(semanticEdge(parentId,id));
 });
 return {nodes:outNodes,edges:outEdges};
}
export function cleanDraft(value:unknown):SavedDraft|null{
 if(!value||typeof value!=='object')return null;const d=value as SavedDraft;
 if(d.version!==2||!Array.isArray(d.nodes)||!Array.isArray(d.edges)||d.nodes.length>300||d.edges.length>400)return null;
 if(!d.viewport||!Number.isFinite(d.viewport.x)||!Number.isFinite(d.viewport.y)||!Number.isFinite(d.viewport.zoom))return null;
 if(d.nodes.some(n=>!n||typeof n.id!=='string'||!n.position||!Number.isFinite(n.position.x)||!Number.isFinite(n.position.y)||!n.analysis))return null;
 const ids=new Set(d.nodes.map(n=>n.id));
 if(ids.size!==d.nodes.length)return null;
 const groups=new Set(d.nodes.filter(n=>n.analysis.kind==='container').map(n=>n.id));
 for(const n of d.nodes){
  const a=n.analysis;
  if(a.canvasWidgetId!==undefined&&(typeof a.canvasWidgetId!=='string'||a.canvasWidgetId.length<1||a.canvasWidgetId.length>120||a.kind==='container'||a.kind==='note'))return null;
  if(!isValidCardDimension(a.cardWidth)||!isValidCardDimension(a.cardHeight))return null;
  if(a.containerId&&(!groups.has(a.containerId)||a.kind==='container'||a.containerId===n.id))return null;
  if(a.kind==='container'&&((a.containerWidth!==undefined&&(!Number.isFinite(a.containerWidth)||a.containerWidth<320||a.containerWidth>4000))||(a.containerHeight!==undefined&&(!Number.isFinite(a.containerHeight)||a.containerHeight<160||a.containerHeight>4000))||(a.containerTone!==undefined&&!['teal','slate','sand'].includes(a.containerTone))||(a.containerCollapsed!==undefined&&typeof a.containerCollapsed!=='boolean')))return null;
 }
 return d;
}
export function serializeDraft(nodes:NNode[],edges:NEdge[],locals:Record<string,Filter[]>,viewport:{x:number;y:number;zoom:number}):SavedDraft{
 return {version:2,nodes:nodes.map(n=>({id:n.id,position:{x:n.position.x,y:n.position.y},analysis:n.data.analysis})),edges:edges.map(e=>({id:e.id,source:e.source,target:e.target,kind:e.data?.kind||'reference'})),localFilters:locals,viewport,timestamp:new Date().toISOString()};
}
export function restoreDraft(d:SavedDraft):{nodes:NNode[];edges:NEdge[]}{
 return {nodes:fitGraphContainers(d.nodes.map(n=>nodeFor(n.analysis,n.position))),edges:d.edges.map(e=>({... (e.kind==='analytic'?semanticEdge(e.source,e.target):e.kind==='annotation'?annotationEdge(e.source,e.target):referenceEdge(e.source,e.target)),id:e.id}))};
}
/**
 * Every arrow is a directed filter dependency. Do not introduce a cycle,
 * using the actual directed connections. A removed edge removes inheritance.
 */
export function isValidReference(source:string,target:string,edges:NEdge[],nodes:NNode[]=[]):boolean{
 if(!source||!target||source===target)return false;
 if(nodes.length&&(!nodes.some(n=>n.id===source)||!nodes.some(n=>n.id===target)))return false;
 if(edges.some(e=>e.source===source&&e.target===target&&e.data?.kind!=='annotation'))return false;
 const next=new Map<string,Set<string>>();
 for(const edge of filterLinks(nodes.map(n=>n.data.analysis),edges)){const set=next.get(edge.source)||new Set<string>();set.add(edge.target);next.set(edge.source,set);}
 const pending=[target],visited=new Set<string>();
 while(pending.length){const id=pending.pop()!;if(id===source)return false;if(visited.has(id))continue;visited.add(id);for(const child of next.get(id)||[])pending.push(child);}
 return true;
}
export function hasAnalyticCycle(nodes:NNode[]):boolean{
 const byId=new Map(nodes.map(n=>[n.id,n.data.analysis]));
 return nodes.some(n=>{let id=n.id;const seen=new Set<string>();while(id&&byId.has(id)){if(seen.has(id))return true;seen.add(id);id=byId.get(id)?.parentId||'';}return false;});
}

/** The React Flow parentId is layout only; AnalysisNode.parentId remains the legacy analytical parent. */
export const CONTAINER_DEFAULT={width:720,height:440};
export function containerSize(a:AnalysisNode){
 return a.containerCollapsed?{width:340,height:116}:{width:a.containerWidth??CONTAINER_DEFAULT.width,height:a.containerHeight??CONTAINER_DEFAULT.height};
}
export function containerLayout(n:NNode):NNode{
 const a=n.data.analysis;
 if(a.kind==='container'){
  const size=containerSize(a);
  return {...n,parentId:undefined,style:{...n.style,width:size.width,height:size.height},zIndex:-1,dragHandle:'.nxt-container-header'};
 }
 const size=cardDimensions(a);
 return {...n,parentId:a.containerId,width:undefined,height:undefined,style:{...n.style,width:size.width,height:size.height}};
}
export function orderedNodes(nodes:NNode[]):NNode[]{
 return [...nodes.filter(n=>n.data.analysis.kind==='container'),...nodes.filter(n=>n.data.analysis.kind!=='container')];
}
export function worldPosition(n:NNode,nodes:NNode[]):XYPosition{
 const group=nodes.find(g=>g.id===n.data.analysis.containerId);
 return group?{x:n.position.x+group.position.x,y:n.position.y+group.position.y}:{...n.position};
}
export function containerAt(nodes:NNode[],point:XYPosition,exclude?:string):NNode|undefined{
 return [...nodes].reverse().find(n=>{
  const a=n.data.analysis;if(n.id===exclude||a.kind!=='container'||a.containerCollapsed)return false;
  const s=containerSize(a);
  return point.x>=n.position.x&&point.x<n.position.x+s.width&&point.y>=n.position.y&&point.y<n.position.y+s.height;
 });
}
export function nodeLayoutSize(n:NNode):CardSize{return n.data.analysis.kind==='container'?containerSize(n.data.analysis):cardDimensions(n.data.analysis);}
const childSize=nodeLayoutSize;
export function minimumContainerSize(nodes:NNode[],id:string){
 return nodes.filter(n=>n.data.analysis.containerId===id).reduce((size,n)=>{
  const c=childSize(n);return {width:Math.max(size.width,Math.ceil(n.position.x+c.width+18)),height:Math.max(size.height,Math.ceil(n.position.y+c.height+18))};
 },{width:320,height:160});
}
/** Enlarge only groups that need room. Preserve all node coordinates and filter relationships. */
export function fitGraphContainers(nodes:NNode[]):NNode[]{
 return nodes.map(n=>{const a=n.data.analysis;if(a.kind!=='container')return n;const min=minimumContainerSize(nodes,n.id),width=Math.min(4000,Math.max(a.containerWidth??CONTAINER_DEFAULT.width,min.width)),height=Math.min(4000,Math.max(a.containerHeight??CONTAINER_DEFAULT.height,min.height));if(width===(a.containerWidth??CONTAINER_DEFAULT.width)&&height===(a.containerHeight??CONTAINER_DEFAULT.height))return n;return containerLayout({...n,data:{...n.data,analysis:{...a,containerWidth:width,containerHeight:height}}});});
}
/** A bottom-right resize leaves positions, membership, filters and links untouched. */
export function resizeGraphCard(nodes:NNode[],id:string,size:CardSize|null):NNode[]{
 const n=nodes.find(x=>x.id===id);if(!n)return nodes;const a=n.data.analysis,b=cardBounds(a);
 if(a.kind==='container'){
  if(a.containerCollapsed)return nodes;const min=minimumContainerSize(nodes,id),target=clampSize(size??b.standard,b);
  const width=Math.min(4000,Math.max(min.width,target.width)),height=Math.min(4000,Math.max(min.height,target.height));
  if(width===containerSize(a).width&&height===containerSize(a).height)return nodes;
  return nodes.map(x=>x.id===id?containerLayout({...x,data:{...x.data,analysis:{...a,containerWidth:width,containerHeight:height}}}):x);
 }
 const limit=a.containerId?{...b,max:{width:Math.min(b.max.width,Math.max(b.min.width,4000-n.position.x-18)),height:Math.min(b.max.height,Math.max(b.min.height,4000-n.position.y-18))}}:b;
 const target=clampSize(size??b.standard,limit),current=cardDimensions(a);
 if(size&&target.width===current.width&&target.height===current.height)return nodes;
 const next=nodes.map(x=>x.id===id?containerLayout({...x,data:{...x.data,analysis:{...a,cardWidth:size?target.width:undefined,cardHeight:size?target.height:undefined}}}):x);
 return a.containerId?fitGraphContainers(next):next;
}
export function changeContainerSettings(nodes:NNode[],id:string,patch:Partial<AnalysisNode>):NNode[]{
 const min=minimumContainerSize(nodes,id);
 const next=nodes.map(n=>{
  if(n.id!==id)return n;
  const a={...n.data.analysis,...patch,id:n.id};
  if(a.kind==='container'){
   a.containerWidth=Math.max(min.width,a.containerWidth??CONTAINER_DEFAULT.width);
   a.containerHeight=Math.max(min.height,a.containerHeight??CONTAINER_DEFAULT.height);
   if(a.containerWidth>4000||a.containerHeight>4000)throw Error('Container überschreitet die maximale Größe von 4000 × 4000.');
  }
  return containerLayout({...n,data:{...n.data,analysis:a}});
 });
 return nodes.find(n=>n.id===id)?.data.analysis.kind==='container'?next:fitGraphContainers(next);
}
export function moveIntoContainer(nodes:NNode[],edges:NEdge[],id:string,groupId?:string,world?:XYPosition):NNode[]{
 const n=nodes.find(x=>x.id===id);
 if(!n||n.data.analysis.kind==='container')throw Error('Container können nicht ineinander verschachtelt werden.');
 const old=n.data.analysis.containerId;
 if(old===groupId&&!world)return nodes;
 const absolute=world??worldPosition(n,nodes);
 const group=groupId?nodes.find(x=>x.id===groupId&&x.data.analysis.kind==='container'):undefined;
 if(groupId&&!group)throw Error('Container nicht vorhanden.');
 if(group?.data.analysis.containerCollapsed)throw Error('Container zuerst öffnen.');
 // Check the candidate hidden edge after detaching the old membership. An existing explicit
 // edge is equivalent, so ignore that duplicate only for the cycle check.
 if(group&&old!==groupId){
  const detached=nodes.map(x=>x.id===id?containerLayout({...x,data:{...x.data,analysis:{...x.data.analysis,containerId:undefined}}}):x);
  if(!isValidReference(group.id,id,edges.filter(e=>!(e.source===group.id&&e.target===id)),detached))throw Error('Gruppierung würde einen Filterkreis erzeugen.');
 }
 let position=absolute;
 if(group){
  if(!world){
   const bottom=nodes.filter(x=>x.id!==id&&x.data.analysis.containerId===group.id).reduce((y,x)=>Math.max(y,x.position.y+childSize(x).height+18),86);
   position={x:18,y:bottom};
  }else{
   position={x:Math.max(18,absolute.x-group.position.x),y:Math.max(86,absolute.y-group.position.y)};
  }
 }
 const moved=nodes.map(x=>x.id===id?containerLayout({...x,position,data:{...x.data,analysis:{...x.data.analysis,containerId:group?.id}}}):x);
 return group?changeContainerSettings(moved,group.id,{}):moved;
}
export function removeContainer(nodes:NNode[],id:string):NNode[]{
 return nodes.filter(n=>n.id!==id).map(n=>n.data.analysis.containerId===id?containerLayout({...n,position:worldPosition(n,nodes),data:{...n.data,analysis:{...n.data.analysis,containerId:undefined}}}):n);
}
