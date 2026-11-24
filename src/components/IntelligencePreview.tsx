import React,{useEffect,useMemo,useState} from 'react';
import {Button,Notice,Spinner} from './Ui';
import Icon from './Icon';
import {DashboardRenderer} from './DashboardBuilder';
import {analysisApi} from '../lib/supabase';
import {effectiveFilters,filterSignature,formatFilter,conflictingFields} from '../core/filters';
import {applyAssistantPlan,type AssistantState} from '../core/assistant';
import type {AiPlan} from '../core/assistantProtocol';
import type {DashboardData,Ribbon} from '../core/types';
const blank:DashboardData={metrics:null,trend:[],breakdown:[],pending:true,error:null};
export function IntelligencePreview({before,plan,stale,onClose,onApply,canApply}:{before:AssistantState;plan:AiPlan;stale:boolean;onClose:()=>void;onApply:()=>void;canApply:boolean}){
 const simulation=useMemo(()=>{try{return {state:applyAssistantPlan(before,plan),error:''}}catch(e){return {state:null,error:e instanceof Error?e.message:'Vorschau ungültig'}}},[before,plan]);
 const after=simulation.state;
 const changed=useMemo(()=>after?after.nodes.filter(n=>{const old=before.nodes.find(x=>x.id===n.id);return !old||JSON.stringify(old.data.analysis)!==JSON.stringify(n.data.analysis)||JSON.stringify(before.dashboards[n.id])!==JSON.stringify(after.dashboards[n.id])||JSON.stringify(before.locals[n.id])!==JSON.stringify(after.locals[n.id])}):[],[before,after]);
 const [target,setTarget]=useState(before.selectedId),[mode,setMode]=useState<'before'|'after'>('after');
 const [detail,setDetail]=useState<DashboardData>(blank);
 const graph=mode==='after'?after:before;
 const available=graph?.nodes.find(n=>n.id===target);
 const dashboard=graph?.dashboards[target];
 const filters=useMemo(()=>{if(!graph||!available)return [];try{return effectiveFilters(graph.globals,graph.nodes.map(n=>n.data.analysis),graph.locals,target,graph.edges)}catch{return []}},[graph,target,available]);
 const signature=filterSignature(filters),conflicts=conflictingFields(filters);
 useEffect(()=>{if(!available||!dashboard?.widgets.length||conflicts.length){setDetail({...blank,pending:false});return}let active=true;setDetail(blank);
  Promise.allSettled([analysisApi.metrics(filters),analysisApi.trend(filters),analysisApi.breakdown('delivery_company',filters)]).then(([m,t,b])=>{
   if(!active)return;const metrics=m.status==='fulfilled'?m.value:null;
   setDetail({metrics,trend:t.status==='fulfilled'?t.value:[],breakdown:b.status==='fulfilled'?b.value:[],ribbon:metrics?{...metrics,deliveryDateCount:metrics.dateCoverage??0} as Ribbon:null,pending:false,error:m.status==='rejected'?'Kennzahlen konnten nicht geladen werden.':null});
  });return()=>{active=false};
 },[target,signature,mode,!!dashboard?.widgets.length,!!available,conflicts.length]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopImmediatePropagation();onClose()}};document.addEventListener('keydown',key,true);return()=>document.removeEventListener('keydown',key,true)},[onClose]);
 const options=after?[...new Map([...(after.nodes.filter(n=>n.id===before.selectedId)),...changed].map(n=>[n.id,n])).values()]:[];
 const nodeName=(id:string)=>after?.nodes.find(n=>n.id===id)?.data.analysis.label||id;
 return <div className="nxt-ai-preview-overlay" role="dialog" aria-modal="true" aria-label="KI Dashboard Vorschau">
  <header className="nxt-ai-preview-header"><div><span className="nxt-eyebrow">NXT INTELLIGENCE · ENTWURF</span><h2>Dashboard & Analysepfad prüfen</h2><p>Live-Daten im simulierten Filterkontext. Der Workspace bleibt bis zur Übernahme unverändert.</p></div><Button icon="x" onClick={onClose}>Schließen</Button></header>
  {simulation.error?<Notice kind="error">{simulation.error}</Notice>:<div className="nxt-ai-preview-layout">
   <aside className="nxt-ai-preview-nav"><h3>Betroffene Elemente</h3><p className="muted">{plan.operations.length} Aktionen · {changed.length} Knoten</p>{options.map(n=>{const added=!before.nodes.some(x=>x.id===n.id),parent=n.data.analysis.containerId||after?.edges.find(e=>e.target===n.id)?.source;return <button type="button" key={n.id} className={n.id===target?'active':''} onClick={()=>{setTarget(n.id);setMode('after')}}><Icon name={n.data.analysis.kind==='container'?'layers':'layout-dashboard'} size={18}/><span><b>{n.data.analysis.label}</b><small>{added?'Neu':'Bestehend'}{parent?' · '+nodeName(parent):''} · {after?.dashboards[n.id]?.widgets.length||0} Blöcke</small></span></button>})}<h4>Neue Verbindungen</h4>{after?.edges.filter(e=>!before.edges.some(b=>b.id===e.id)).map(e=><p className="nxt-ai-preview-edge" key={e.id}>{nodeName(e.source)} → {nodeName(e.target)}</p>)}{after?.nodes.filter(n=>n.data.analysis.containerId&&!before.nodes.some(b=>b.id===n.id&&b.data.analysis.containerId===n.data.analysis.containerId)).map(n=><p className="nxt-ai-preview-edge" key={n.id}>{nodeName(n.data.analysis.containerId!)} → {n.data.analysis.label} (Gruppe)</p>)}</aside>
   <main className="nxt-ai-preview-main"><div className="nxt-ai-preview-toggle"><Button kind={mode==='before'?'primary':'secondary'} disabled={!before.nodes.some(n=>n.id===target)} onClick={()=>setMode('before')}>Vorher</Button><Button kind={mode==='after'?'primary':'secondary'} onClick={()=>setMode('after')}>Nachher</Button><span className="muted">{dashboard?.widgets.length||0} Widgets</span></div><h3>{available?.data.analysis.label||'Neuer Knoten'}</h3><div className="nxt-ai-preview-filters">{filters.length?filters.map(f=><span key={f.id}>{formatFilter(f)}</span>):<span>Gesamte Datenbasis · keine Filter</span>}</div>{conflicts.length?<Notice kind="warning">Widersprüchliche Filter. Keine Auswertung.</Notice>:dashboard?.widgets.length?<DashboardRenderer dashboard={dashboard} detail={detail} filters={filters}/>:<Notice>Für dieses Element sind keine Dashboard-Blöcke definiert. Die zugehörigen Analysezweige können links geöffnet werden.</Notice>}</main>
  </div>}
  <footer className="nxt-ai-preview-footer">{stale?<Notice kind="warning">Workspace wurde verändert. Bitte Vorschlag erneut erstellen.</Notice>:<span className="muted">Erst der Klick übernimmt die geprüfte Struktur. Speichern bleibt ein separater Schritt.</span>}<div><Button onClick={onClose}>Zurück zum Chat</Button><Button kind="primary" icon="check" disabled={!canApply||stale||!after} onClick={onApply}>Änderungen übernehmen</Button></div></footer>
 </div>;
}
