import {containerLayout,containerSize,nodeLayoutSize,worldPosition,type NNode,type NEdge} from './graph';
import {effectiveFilters,conflictingFields,filterLinks} from './filters';
import {findingStatus} from './findings';
import type {Filter} from './types';
import type {NodeDashboard} from './dashboard';
export type LayoutMode='hybrid'|'tree'|'free';
type Rect={x:number;y:number;width:number;height:number};
export type LayoutIssue={kind:'error'|'warning';title:string;detail:string;nodeId?:string};
export const overlaps=(a:Rect,b:Rect,gap=0)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
export const geometry=(n:NNode):Rect=>({...n.position,...nodeLayoutSize(n)});
const stable=(a:NNode,b:NNode)=>a.position.y-b.position.y||a.position.x-b.position.x||a.id.localeCompare(b.id);
export function layoutFingerprint(nodes:NNode[],edges:NEdge[]){return JSON.stringify([nodes.map(n=>[n.id,n.position,n.data.analysis.containerId,n.data.analysis.containerCollapsed,nodeLayoutSize(n)]),edges.map(e=>[e.source,e.target,e.data?.kind])]);}
/** Collapse members into their visual group for layout only. No semantic edge is modified. */
export function analysisLevels(nodes:NNode[],edges:NEdge[]){
 const byId=new Map(nodes.map(n=>[n.id,n])),top=nodes.filter(n=>!n.data.analysis.containerId),topIds=new Set(top.map(n=>n.id)),next=new Map(top.map(n=>[n.id,new Set<string>()])),parents=new Map(top.map(n=>[n.id,new Set<string>()]));
 const owner=(id:string)=>byId.get(id)?.data.analysis.containerId||id;
 const reaches=(a:string,b:string)=>{const visited=new Set<string>(),queue=[a];while(queue.length){const x=queue.pop()!;if(x===b)return true;if(visited.has(x))continue;visited.add(x);for(const v of next.get(x)||[])queue.push(v);}return false;};
 const skipped:string[]=[];
 const add=(s:string,t:string)=>{const a=owner(s),b=owner(t);if(a===b||!topIds.has(a)||!topIds.has(b)||next.get(a)!.has(b))return;if(reaches(b,a)){skipped.push(s+' → '+t);return;}next.get(a)!.add(b);parents.get(b)!.add(a);};
 for(const e of edges.filter(e=>e.data?.kind!=='annotation'))add(e.source,e.target);
 // Documentary links can guide visual reading order, but never force a layout cycle.
 for(const e of edges.filter(e=>e.data?.kind==='annotation'))add(e.source,e.target);
 const rank=new Map(top.map(n=>[n.id,0])),incoming=new Map([...parents].map(([id,p])=>[id,p.size]));
 const queue=top.filter(n=>incoming.get(n.id)===0).sort((a,b)=>(a.data.analysis.kind==='root'?-1:0)-(b.data.analysis.kind==='root'?-1:0)||stable(a,b)).map(n=>n.id);
 for(let i=0;i<queue.length;i++){const id=queue[i];for(const c of next.get(id)||[]){rank.set(c,Math.max(rank.get(c)||0,(rank.get(id)||0)+1));incoming.set(c,incoming.get(c)!-1);if(incoming.get(c)===0)queue.push(c);}}
 for(const n of nodes)if(n.data.analysis.containerId)rank.set(n.id,rank.get(n.data.analysis.containerId)||0);
 return {rank,parents,skipped};
}
function packMembers(members:NNode[],mode:LayoutMode){
 if(!members.length)return {positions:new Map<string,{x:number;y:number}>(),width:320,height:160};
 const sorted=[...members].sort((a,b)=>Number(a.data.analysis.kind==='note')-Number(b.data.analysis.kind==='note')||stable(a,b));
 let best:{positions:Map<string,{x:number;y:number}>;width:number;height:number;score:number}|null=null;
 for(let columns=1;columns<=Math.min(mode==='tree'?3:5,sorted.length);columns++){
  const widths=Array.from({length:columns},(_,i)=>Math.max(0,...sorted.filter((_,j)=>j%columns===i).map(n=>nodeLayoutSize(n).width))),positions=new Map<string,{x:number;y:number}>();let y=86,maxX=320;
  for(let i=0;i<sorted.length;i+=columns){const row=sorted.slice(i,i+columns);let x=18;for(let j=0;j<row.length;j++){positions.set(row[j].id,{x,y});maxX=Math.max(maxX,x+nodeLayoutSize(row[j]).width+18);x+=widths[j]+24;}y+=Math.max(...row.map(n=>nodeLayoutSize(n).height))+24;}
  const width=Math.ceil(maxX),height=Math.ceil(Math.max(160,y-6)),score=width*height*(1+Math.abs(Math.log(width/height/(mode==='tree'?1:1.45)))*.25);
  if(width<=4000&&height<=4000&&(!best||score<best.score))best={positions,width,height,score};
 }
 return best;
}
export function smartLayout(nodes:NNode[],edges:NEdge[],mode:LayoutMode='hybrid'){
 const levels=analysisLevels(nodes,edges),warnings:string[]=[];
 if(mode==='free')return {nodes,levels,warnings};
 let out=[...nodes];
 for(const group of nodes.filter(n=>n.data.analysis.kind==='container'&&!n.data.analysis.containerCollapsed)){
  const members=out.filter(n=>n.data.analysis.containerId===group.id);if(!members.length)continue;
  const packed=packMembers(members,mode);if(!packed){warnings.push('Container „'+group.data.analysis.label+'“ überschreitet die verfügbare Fläche. Bitte aufteilen.');continue;}
  out=out.map(n=>n.id===group.id?containerLayout({...n,data:{...n.data,analysis:{...n.data.analysis,containerWidth:packed.width,containerHeight:packed.height}}}):packed.positions.has(n.id)?{...n,position:packed.positions.get(n.id)!}:n);
 }
 const top=out.filter(n=>!n.data.analysis.containerId),maxRank=Math.max(0,...top.map(n=>levels.rank.get(n.id)||0));
 const sumArea=top.reduce((s,n)=>{const r=nodeLayoutSize(n);return s+(r.width+90)*(r.height+115)},0);
 const maxWidth=Math.max(1100,Math.max(0,...top.map(n=>nodeLayoutSize(n).width))+80,Math.min(5000,Math.sqrt(sumArea)*1.4));
 const locations=new Map<string,{x:number;y:number}>(),rows:{nodes:NNode[];width:number;height:number}[][]=[];
 const centers=new Map<string,number>();
 for(let level=0;level<=maxRank;level++){
  const entries=top.filter(n=>levels.rank.get(n.id)===level);
  const bary=(n:NNode)=>{const xs=[...(levels.parents.get(n.id)||[])].map(id=>centers.get(id)).filter((x):x is number=>x!==undefined);return xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:n.position.x;};
  entries.sort((a,b)=>bary(a)-bary(b)||stable(a,b));
  let row:{nodes:NNode[];width:number;height:number}={nodes:[],width:0,height:0};const groupRows:typeof row[]=[];
  for(const n of entries){const s=nodeLayoutSize(n),gap=mode==='tree'?100:70;if(row.nodes.length&&row.width+gap+s.width>maxWidth){groupRows.push(row);row={nodes:[],width:0,height:0};}row.width+=(row.nodes.length?gap:0)+s.width;row.height=Math.max(row.height,s.height);row.nodes.push(n);}
  if(row.nodes.length)groupRows.push(row);
  for(const r of groupRows){let x=(maxWidth-r.width)/2+60;for(const n of r.nodes){const s=nodeLayoutSize(n);centers.set(n.id,x+s.width/2);x+=s.width+(mode==='tree'?100:70);}}
  rows.push(groupRows);
 }
 let y=65;
 for(const rs of rows){for(const r of rs){let x=(maxWidth-r.width)/2+60;for(const n of r.nodes){locations.set(n.id,{x:Math.round(x),y:Math.round(y)});x+=nodeLayoutSize(n).width+(mode==='tree'?100:70);}y+=r.height+90;}if(rs.length)y+=45;}
 out=out.map(n=>locations.has(n.id)?{...n,position:locations.get(n.id)!}:n);
 if(levels.skipped.length)warnings.push(levels.skipped.length+' rückläufige Verbindung(en) nur bei der visuellen Ebenenzuordnung ignoriert. Filter und Referenzen bleiben unverändert.');
 return {nodes:out,levels,warnings};
}
/** Transfer geometry, not stale metrics or other node state from a preview. */
export function commitLayout(current:NNode[],proposed:NNode[]):NNode[]{
 const byId=new Map(proposed.map(n=>[n.id,n]));
 if(current.length!==proposed.length||current.some(n=>!byId.has(n.id)))throw Error('Workspace wurde verändert. Bitte Vorschau neu berechnen.');
 return current.map(n=>{const p=byId.get(n.id)!,a=n.data.analysis,b=p.data.analysis;if(a.containerId!==b.containerId||a.containerCollapsed!==b.containerCollapsed)throw Error('Containerstruktur wurde geändert.');
 return containerLayout({...n,position:{...p.position},data:{...n.data,analysis:a.kind==='container'?{...a,containerWidth:b.containerWidth,containerHeight:b.containerHeight}:a}});});
}
export function workspaceIssues(nodes:NNode[],edges:NEdge[],globals:Filter[],locals:Record<string,Filter[]>,dashboards:Record<string,NodeDashboard>):LayoutIssue[]{
 const issues:LayoutIssue[]=[],ids=new Set(nodes.map(n=>n.id)),byId=new Map(nodes.map(n=>[n.id,n])),edgeIds=new Set<string>(),links=new Set<string>();
 const add=(kind:LayoutIssue['kind'],title:string,detail:string,nodeId?:string)=>issues.push({kind,title,detail,nodeId});
 if(ids.size!==nodes.length)add('error','Doppelte Knoten-ID','Workspace enthält nicht eindeutige Elemente.');
 for(const e of edges){const key=JSON.stringify([e.source,e.target,e.data?.kind==='annotation'?'annotation':'filter']);if(edgeIds.has(e.id)||links.has(key))add('warning','Doppelte Verbindung','Verbindung '+e.id,e.source);edgeIds.add(e.id);links.add(key);if(!ids.has(e.source)||!ids.has(e.target)||e.source===e.target)add('error','Ungültige Verbindung','Quelle oder Ziel fehlt bzw. ist identisch.',ids.has(e.source)?e.source:undefined);}
 for(const n of nodes){const a=n.data.analysis;
  if(!Number.isFinite(n.position.x)||!Number.isFinite(n.position.y))add('error','Ungültige Position',a.label,n.id);
  if(a.containerId){const group=byId.get(a.containerId);if(!group||group.data.analysis.kind!=='container'||a.kind==='container')add('error','Ungültige Containerzuordnung',a.label,n.id);else{const g={...group.data.analysis,containerCollapsed:false},s=containerSize(g),r=geometry(n);if(r.x<18||r.y<86||r.x+r.width+18>s.width+1||r.y+r.height+18>s.height+1)add('warning','Element außerhalb des Container-Inhalts',a.label,n.id);}}
  try{const fs=effectiveFilters(globals,nodes.map(x=>x.data.analysis),locals,n.id,edges),conflicts=conflictingFields(fs);if(conflicts.length)add('error','Filterkonflikt',a.label+' · '+conflicts.join(', '),n.id);}catch(e){add('error','Ungültiger Filterpfad',a.label+' · '+(e instanceof Error?e.message:'Unbekannter Fehler'),n.id);}
  if(a.canvasWidgetId&&!dashboards[n.id]?.widgets.some(w=>w.id===a.canvasWidgetId&&(!a.canvasWidgetType||a.canvasWidgetType===w.type)))add('error','Widget-Verknüpfung fehlt',a.label,n.id);
  if(n.data.error)add('error','Datenabfrage fehlgeschlagen',a.label+' · '+n.data.error,n.id);
  if(a.finding){const s=findingStatus(a,nodes,edges,globals,locals);if(s.state==='stale'||s.state==='unverified')add('warning','Finding prüfen',a.label+' · '+s.text,n.id);}
 }
 for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j];if(a.data.analysis.containerId===b.data.analysis.containerId&&overlaps(geometry(a),geometry(b)))add('warning','Überlappung',a.data.analysis.label+' / '+b.data.analysis.label,a.id);}
 for(const id of Object.keys(locals))if(!ids.has(id))add('warning','Verwaister lokaler Filter','Filter ohne zugehörigen Knoten.');
 return issues.sort((a,b)=>Number(a.kind==='warning')-Number(b.kind==='warning'));
}
