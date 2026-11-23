import type {Node,Edge,XYPosition} from '@xyflow/react';
import type {AnalysisNode,GraphNodeData,BreakdownRow,SavedDraft,Filter} from './types';
import type {FieldKey} from '../config';
export type NNode=Node<GraphNodeData,'analytics'>;
export type NEdge=Edge<{kind:'analytic'|'reference'}>;
export const ROOT_ID='root:otd';
export function rootAnalysis():AnalysisNode{return {id:ROOT_ID,parentId:null,label:'On-Time Delivery',kind:'root',createdBy:'system',metricId:'otd'};}
export function nodeFor(analysis:AnalysisNode,position:XYPosition,metrics?:{orders?:number|null;onTimeRate?:number|null}):NNode{
 return {id:analysis.id,type:'analytics',position,data:{analysis,orders:metrics?.orders,onTimeRate:metrics?.onTimeRate},draggable:true};
}
export function semanticEdge(parent:string,child:string):NEdge{
 return {id:'analytic:'+parent+'=>'+child,source:parent,target:child,type:'smoothstep',animated:false,style:{stroke:'#008B92',strokeWidth:2},data:{kind:'analytic'}};
}
export function referenceEdge(parent:string,child:string):NEdge{
 return {id:'reference:'+crypto.randomUUID(),source:parent,target:child,type:'smoothstep',style:{stroke:'#36AAB0',strokeDasharray:'6 5',strokeWidth:2},data:{kind:'reference'},label:'Referenz'};
}
export function createInitialGraph(factories:BreakdownRow[],rootMetric?:{orders?:number;onTimeRate?:number|null}):{nodes:NNode[];edges:NEdge[]}{
 const rows=factories.filter(r=>r.label!==null);
 const root=nodeFor(rootAnalysis(),{x:550,y:30},rootMetric);
 const nodes=[root,...rows.map((r,i)=>nodeFor({
  id:'factory:'+r.label,parentId:ROOT_ID,label:String(r.label),kind:'segment',createdBy:'system',
  predicate:{id:'p:factory:'+r.label,field:'factory',op:'eq',value:String(r.label),scope:'local'}
 },{x:45+i*225,y:245},{orders:Number(r.orders),onTimeRate:r.on_time_rate===null?null:Number(r.on_time_rate)}))];
 return {nodes,edges:nodes.slice(1).map(n=>semanticEdge(ROOT_ID,n.id))};
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
  const x=parent.position.x+(i-(count-1)/2)*218,y=parent.position.y+235;
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
 return d;
}
export function serializeDraft(nodes:NNode[],edges:NEdge[],locals:Record<string,Filter[]>,viewport:{x:number;y:number;zoom:number}):SavedDraft{
 return {version:2,nodes:nodes.map(n=>({id:n.id,position:{x:n.position.x,y:n.position.y},analysis:n.data.analysis})),edges:edges.map(e=>({id:e.id,source:e.source,target:e.target,kind:e.data?.kind||'reference'})),localFilters:locals,viewport,timestamp:new Date().toISOString()};
}
export function restoreDraft(d:SavedDraft):{nodes:NNode[];edges:NEdge[]}{
 return {nodes:d.nodes.map(n=>nodeFor(n.analysis,n.position)),edges:d.edges.map(e=>e.kind==='analytic'?{...semanticEdge(e.source,e.target),id:e.id}:{...referenceEdge(e.source,e.target),id:e.id})};
}
export function isValidReference(source:string,target:string,edges:NEdge[]):boolean{
 if(!source||!target||source===target)return false;
 return !edges.some(e=>e.source===source&&e.target===target);
}
export function hasAnalyticCycle(nodes:NNode[]):boolean{
 const byId=new Map(nodes.map(n=>[n.id,n.data.analysis]));
 return nodes.some(n=>{let id=n.id;const seen=new Set<string>();while(id&&byId.has(id)){if(seen.has(id))return true;seen.add(id);id=byId.get(id)?.parentId||'';}return false;});
}
