import React,{useEffect,useMemo,useState} from 'react';
import {Button,Notice,Spinner} from './Ui';
import Icon from './Icon';
import {DashboardRenderer} from './DashboardBuilder';
import {analysisApi} from '../lib/supabase';
import {effectiveFilters,filterSignature,formatFilter,conflictingFields} from '../core/filters';
import {applyAssistantPlan,assistantBlockSize,type AssistantState} from '../core/assistant';
import type {AiPlan} from '../core/assistantProtocol';
import type {DashboardData,Ribbon} from '../core/types';
import {worldPosition} from '../core/graph';
function Structure({state,onSelect,selected}:{state:AssistantState;onSelect:(id:string)=>void;selected:string}){
 const list=state.nodes.filter(n=>!n.data.analysis.containerId||!state.nodes.find(g=>g.id===n.data.analysis.containerId)?.data.analysis.containerCollapsed).map(n=>{const p=worldPosition(n,state.nodes),a=n.data.analysis,group=a.kind==='container',size=assistantBlockSize(n);return {n,p,group,size}});
 const minX=Math.min(0,...list.map(x=>x.p.x))-45,minY=Math.min(0,...list.map(x=>x.p.y))-45,maxX=Math.max(400,...list.map(x=>x.p.x+x.size.width))+45,maxY=Math.max(260,...list.map(x=>x.p.y+x.size.height))+45;
 const byId=new Map(list.map(x=>[x.n.id,x]));
 return <div className="nxt-ai-structure-scroll"><svg role="img" aria-label="Vorschau des Analysepfads mit Containern und Verbindungen" viewBox={minX+' '+minY+' '+(maxX-minX)+' '+(maxY-minY)} style={{minWidth:Math.min(2400,Math.max(650,(maxX-minX)*.72)),width:'100%',display:'block'}}><defs><marker id="ai-preview-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7Z" fill="#008b92"/></marker></defs>
 {list.filter(x=>x.group).map(({n,p,size})=><g key={n.id} onClick={()=>onSelect(n.id)}><rect x={p.x} y={p.y} width={size.width} height={size.height} rx={17} fill="#e8f5f5" stroke={n.id===selected?'#00666b':'#70b9bd'} strokeWidth={2} strokeDasharray="6 4"/><text x={p.x+16} y={p.y+31} fontSize={16} fill="#00666b" fontWeight="600">{n.data.analysis.label.slice(0,48)}</text></g>)}
 {state.edges.map(e=>{const a=byId.get(e.source),b=byId.get(e.target);if(!a||!b)return null;const x1=a.p.x+a.size.width/2,y1=a.p.y+a.size.height,x2=b.p.x+b.size.width/2,y2=b.p.y;return <path key={e.id} d={'M'+x1+' '+y1+' C'+x1+' '+(y1+45)+' '+x2+' '+(y2-45)+' '+x2+' '+y2} stroke="#008b92" strokeWidth={2.4} fill="none" markerEnd="url(#ai-preview-arrow)"/>})}
 {list.filter(x=>!x.group).map(({n,p,size})=><g key={n.id} onClick={()=>onSelect(n.id)} tabIndex={0} role="button" aria-label={'Dashboard '+n.data.analysis.label+' öffnen'} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(n.id)}}} style={{cursor:'pointer'}}><rect x={p.x} y={p.y} width={size.width} height={size.height} rx={12} fill="white" stroke={n.id===selected?'#008b92':'#bdd5d6'} strokeWidth={n.id===selected?3:1.5}/><text x={p.x+14} y={p.y+28} fontSize={14} fontWeight="600" fill="#163338">{n.data.analysis.label.slice(0,Math.floor((size.width-20)/7))}</text><text x={p.x+14} y={p.y+54} fontSize={12} fill="#526b70">{n.data.analysis.visualization||'kpi'} · {state.dashboards[n.id]?.widgets.length||0} Dashboard-Blöcke</text></g>)}
 </svg></div>;
}
const blank:DashboardData={metrics:null,trend:[],breakdown:[],pending:true,error:null};
export function IntelligencePreview({before,plan,stale,onClose,onApply,canApply}:{before:AssistantState;plan:AiPlan;stale:boolean;onClose:()=>void;onApply:()=>void;canApply:boolean}){
 const simulation=useMemo(()=>{try{return {state:applyAssistantPlan(before,plan),error:''}}catch(e){return {state:null,error:e instanceof Error?e.message:'Vorschau ungültig'}}},[before,plan]);
 const after=simulation.state;
 const changed=useMemo(()=>after?after.nodes.filter(n=>{const old=before.nodes.find(x=>x.id===n.id);return !old||JSON.stringify(old.data.analysis)!==JSON.stringify(n.data.analysis)||JSON.stringify(before.dashboards[n.id])!==JSON.stringify(after.dashboards[n.id])||JSON.stringify(before.locals[n.id])!==JSON.stringify(after.locals[n.id])}):[],[before,after]);
 const [target,setTarget]=useState(before.selectedId),[mode,setMode]=useState<'before'|'after'>('after'),[tab,setTab]=useState<'dashboard'|'structure'>('dashboard');
 const [detail,setDetail]=useState<DashboardData>(blank);
 const graph=mode==='after'?after:before;
 const available=graph?.nodes.find(n=>n.id===target);
 const dashboard=graph?.dashboards[target];
 const filterResult=useMemo(()=>{if(!graph||!available)return {filters:[],error:''};try{return {filters:effectiveFilters(graph.globals,graph.nodes.map(n=>n.data.analysis),graph.locals,target,graph.edges),error:''}}catch(e){return {filters:[],error:e instanceof Error?e.message:'Filterkontext ungültig'}}},[graph,target,available]);
 const {filters,error:filterError}=filterResult;
 const signature=filterSignature(filters),conflicts=conflictingFields(filters);
 useEffect(()=>{if(!available||!dashboard?.widgets.length||conflicts.length||filterError||tab==='structure'){setDetail({...blank,pending:false});return}let active=true;setDetail(blank);
  Promise.allSettled([analysisApi.metrics(filters),analysisApi.trend(filters),analysisApi.breakdown('delivery_company',filters)]).then(([m,t,b])=>{
   if(!active)return;const metrics=m.status==='fulfilled'?m.value:null;
   setDetail({metrics,trend:t.status==='fulfilled'?t.value:[],breakdown:b.status==='fulfilled'?b.value:[],ribbon:metrics?{...metrics,deliveryDateCount:metrics.dateCoverage??0} as Ribbon:null,pending:false,error:m.status==='rejected'?'Kennzahlen konnten nicht geladen werden.':null});
  });return()=>{active=false};
 },[target,signature,mode,!!dashboard?.widgets.length,!!available,conflicts.length,filterError,tab]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopImmediatePropagation();onClose()}};document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true)},[onClose]);
 const options=after?[...new Map([...(after.nodes.filter(n=>n.id===before.selectedId)),...changed].map(n=>[n.id,n])).values()]:[];
 const nodeName=(id:string)=>after?.nodes.find(n=>n.id===id)?.data.analysis.label||id;
 return <div className="nxt-ai-preview-overlay" role="dialog" aria-modal="true" aria-label="KI Dashboard Vorschau">
  <header className="nxt-ai-preview-header"><div><span className="nxt-eyebrow">NXT INTELLIGENCE · ENTWURF</span><h2>Dashboard & Analysepfad prüfen</h2><p>Live-Daten im simulierten Filterkontext. Der Workspace bleibt bis zur Übernahme unverändert.</p></div><Button icon="x" onClick={onClose}>Schließen</Button></header>
  {simulation.error?<Notice kind="error">{simulation.error}</Notice>:<div className="nxt-ai-preview-layout">
   <aside className="nxt-ai-preview-nav"><h3>Betroffene Elemente</h3><p className="muted">{plan.operations.length} Aktionen · {changed.length} Knoten</p>{options.map(n=>{const added=!before.nodes.some(x=>x.id===n.id),parent=n.data.analysis.containerId||after?.edges.find(e=>e.target===n.id)?.source;return <button type="button" key={n.id} className={n.id===target?'active':''} onClick={()=>{setTarget(n.id);setMode('after');setTab('dashboard')}}><Icon name={n.data.analysis.kind==='container'?'layers':'layout-dashboard'} size={18}/><span><b>{n.data.analysis.label}</b><small>{added?'Neu':'Bestehend'}{parent?' · '+nodeName(parent):''} · {after?.dashboards[n.id]?.widgets.length||0} Blöcke</small></span></button>})}<h4>Neue Verbindungen</h4>{after?.edges.filter(e=>!before.edges.some(b=>b.id===e.id)).map(e=><p className="nxt-ai-preview-edge" key={e.id}>{nodeName(e.source)} → {nodeName(e.target)}</p>)}{after?.nodes.filter(n=>n.data.analysis.containerId&&!before.nodes.some(b=>b.id===n.id&&b.data.analysis.containerId===n.data.analysis.containerId)).map(n=><p className="nxt-ai-preview-edge" key={n.id}>{nodeName(n.data.analysis.containerId!)} → {n.data.analysis.label} (Gruppe)</p>)}</aside>
   <main className="nxt-ai-preview-main"><div className="nxt-ai-preview-toggle"><Button kind={mode==='before'?'primary':'secondary'} disabled={!before.nodes.some(n=>n.id===target)} onClick={()=>setMode('before')}>Vorher</Button><Button kind={mode==='after'?'primary':'secondary'} onClick={()=>setMode('after')}>Nachher</Button><span className="muted">{dashboard?.widgets.length||0} Widgets</span></div><div className="nxt-ai-preview-toggle nxt-ai-preview-tabs"><Button kind={tab==='dashboard'?'soft':'ghost'} icon="layout-dashboard" onClick={()=>setTab('dashboard')}>Dashboard</Button><Button kind={tab==='structure'?'soft':'ghost'} icon="network" onClick={()=>setTab('structure')}>Analysepfad</Button></div>{tab==='structure'&&graph?<Structure state={graph} selected={target} onSelect={id=>{setTarget(id);setTab('dashboard')}}/>:<><h3>{available?.data.analysis.label||'Neuer Knoten'}</h3><div className="nxt-ai-preview-filters">{filters.length?filters.map(f=><span key={f.id}>{formatFilter(f)}</span>):<span>Gesamte Datenbasis · keine Filter</span>}</div>{filterError?<Notice kind="error">{filterError}</Notice>:conflicts.length?<Notice kind="warning">Widersprüchliche Filter. Keine Auswertung.</Notice>:dashboard?.widgets.length?<DashboardRenderer dashboard={dashboard} detail={detail} filters={filters}/>:<Notice>Für dieses Element sind keine Dashboard-Blöcke definiert. Die zugehörigen Analysezweige können links geöffnet werden.</Notice>}</>}</main>
  </div>}
  <footer className="nxt-ai-preview-footer">{stale?<Notice kind="warning">Workspace wurde verändert. Bitte Vorschlag erneut erstellen.</Notice>:<span className="muted">Erst der Klick übernimmt die geprüfte Struktur. Speichern bleibt ein separater Schritt.</span>}<div><Button onClick={onClose}>Zurück zum Chat</Button><Button kind="primary" icon="check" disabled={!canApply||stale||!after} onClick={onApply}>Änderungen übernehmen</Button></div></footer>
 </div>;
}
