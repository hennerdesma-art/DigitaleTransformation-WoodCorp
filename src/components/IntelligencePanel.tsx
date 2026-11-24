import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Icon from './Icon';
import {Button,Notice,IconButton} from './Ui';
import {analysisApi} from '../lib/supabase';
import {intelligenceApi,type AiMessage,type AiStatus} from '../lib/intelligence';
import {actionLabel,applyAssistantPlan,contextForAssistant,localAssistantPlan,type AssistantState} from '../core/assistant';
import {validatePlan,type AiPlan} from '../core/assistantProtocol';
import {effectiveFilters} from '../core/filters';
import {IntelligencePreview} from './IntelligencePreview';
const AI_LOGO=import.meta.env.BASE_URL+'nxt-intelligence.webp';
type Template='dashboard'|'new_dashboard'|'path';
type Entry=AiMessage&{id:string;plan?:AiPlan;fingerprint?:string;applied?:boolean;source?:'local'|'model'};
type Props={state:AssistantState;workspace:{id:string;title:string;revision:number}|null;fingerprint:string;canEdit:boolean;busy:boolean;onApply:(plan:AiPlan,fingerprint:string)=>void;onUndo:()=>void;onSelectNode:(id:string)=>void;onOpenDashboard:()=>void;open:boolean;onOpen:(open:boolean)=>void};
export function IntelligencePanel({state,workspace,fingerprint,canEdit,busy,onApply,onUndo,onSelectNode,onOpenDashboard,open,onOpen}:Props){
 const scope=workspace?.id||'local',scopeRef=useRef(scope),abortRef=useRef<AbortController|null>(null),end=useRef<HTMLDivElement>(null),launcher=useRef<HTMLButtonElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const [threads,setThreads]=useState<Record<string,Entry[]>>({}),[draft,setDraft]=useState(''),[pending,setPending]=useState(false),[status,setStatus]=useState<AiStatus|null>(null),[statusError,setStatusError]=useState(false),[consent,setConsent]=useState(false),[error,setError]=useState('');
 const [preview,setPreview]=useState<{entry:Entry;state:AssistantState}|null>(null);
 const [portalTarget,setPortalTarget]=useState<Element>(()=>document.fullscreenElement||document.body);
 useEffect(()=>{const update=()=>setPortalTarget(document.fullscreenElement||document.body);document.addEventListener('fullscreenchange',update);return()=>document.removeEventListener('fullscreenchange',update)},[]);
 const entries=threads[scope]||[];
 const selected=state.nodes.find(n=>n.id===state.selectedId);
 const labels:Record<string,string>={};for(const n of state.nodes)labels[n.id]=n.data.analysis.label;for(const d of Object.values(state.dashboards))for(const w of d.widgets)labels[w.id]=w.title;
 useEffect(()=>{scopeRef.current=scope;abortRef.current?.abort();setPending(false);setDraft('');setError('');setConsent(false);setPreview(null)},[scope]);
 useEffect(()=>()=>abortRef.current?.abort(),[]);
 useEffect(()=>{if(!open)return;const c=new AbortController();setStatusError(false);const refresh=()=>intelligenceApi.status(c.signal).then(s=>{if(!c.signal.aborted){setStatus(s);setStatusError(false)}}).catch(()=>{if(!c.signal.aborted){setStatus(null);setStatusError(true)}});void refresh();const timer=setInterval(refresh,30000);input.current?.focus();return()=>{c.abort();clearInterval(timer)}},[open,scope]);
 useEffect(()=>{if(open)end.current?.scrollIntoView({block:'nearest'})},[open,entries.length,pending]);
 useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!preview&&!document.querySelector('.modal-backdrop')){onOpen(false);launcher.current?.focus()}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[open,onOpen,preview]);
 const append=(at:string,entry:Entry)=>setThreads(old=>({...old,[at]:[...(old[at]||[]),entry].slice(-30)}));
 const send=async(template?:Template)=>{
  const text=template==='dashboard'?'Ergänze das aktuelle Dashboard sinnvoll mit fehlenden relevanten KPIs, Segmentvergleichen und Datenqualität; vorhandene Widgets beibehalten.':template==='new_dashboard'?'Erstelle ein vollständiges neues Dashboard auf diesem Knoten. Bestehende Widgets dieses Knotens dürfen explizit ersetzt werden. Nutze die Aufbauanweisungen und passende Kennzahlen.':template==='path'?'Erstelle einen vollständigen nachvollziehbaren Thinking Path als Analysezweige mit Containern, Forschungsfragen und Dashboards. Bestehende Knoten beibehalten.':draft.trim();
  if(!text||pending||!selected)return;
  const at=scope,stamp=fingerprint,c=new AbortController();abortRef.current?.abort();abortRef.current=c;
  setPending(true);setError('');setDraft('');
  append(at,{id:crypto.randomUUID(),role:'user',text});
  try{
   let result:AiPlan;let source:'local'|'model'='local';
   if(status?.enabled&&consent){
    source='model';result=await intelligenceApi.ask(text,contextForAssistant(state,workspace,canEdit),entries.slice(-8).map(({role,text})=>({role,text:text.slice(0,1600)})),c.signal);
   }else{
    let metrics=null;
    if(!template){try{metrics=await analysisApi.metrics(effectiveFilters(state.globals,state.nodes.map(n=>n.data.analysis),state.locals,state.selectedId,state.edges))}catch{/* Explicit no-data reply. */}}
    result=localAssistantPlan(text,state,metrics,canEdit,template);
   }
   if(c.signal.aborted||scopeRef.current!==at)return;
   const plan=validatePlan(result,state.nodes.map(n=>n.id),state.allowedFields,canEdit);
   if(plan.operations.length)applyAssistantPlan(state,plan);
   const entry:Entry={id:crypto.randomUUID(),role:'assistant',text:plan.answer,plan,fingerprint:stamp,source};append(at,entry);
   if(plan.operations.length)setPreview({entry,state});
  }catch(e){if(!c.signal.aborted&&scopeRef.current===at)setError(e instanceof Error?e.message:'Anfrage fehlgeschlagen.')}
  finally{if(!c.signal.aborted&&scopeRef.current===at)setPending(false)}
 };
 const apply=(entry:Entry)=>{
  if(!entry.plan||entry.applied||!canEdit||busy||entry.fingerprint!==fingerprint)return;
  try{onApply(entry.plan,entry.fingerprint);setThreads(old=>({...old,[scope]:(old[scope]||[]).map(e=>e.id===entry.id?{...e,applied:true}:e)}));setError('');setPreview(null)}
  catch(e){setError(e instanceof Error?e.message:'Änderungen nicht übernommen.')}
 };
 const close=()=>{onOpen(false);requestAnimationFrame(()=>launcher.current?.focus())};
 return createPortal(<div className="nxt-intelligence-shell">
  {open&&<aside className="nxt-intelligence-panel" role="region" aria-label="NXT Intelligence Assistent">
   <header className="nxt-intelligence-head"><div className="nxt-intelligence-emblem"><img src={AI_LOGO} alt="NXT Intelligence"/></div><div><strong>NXT Intelligence</strong><small>Workspace Copilot</small></div><IconButton name="x" title="Assistent schließen" onClick={close}/></header>
   <div className="nxt-intelligence-context"><span><Icon name="layout-dashboard" size={16}/> Workspace <b title={workspace?.title}>{workspace?.title||'Lokaler Entwurf'}</b></span><span><Icon name="network" size={16}/> Knoten <select aria-label="Analyseblock auswählen" value={selected?.id||''} onChange={e=>onSelectNode(e.target.value)} disabled={pending||!state.nodes.length}>{!state.nodes.length&&<option value="">Kein Knoten verfügbar</option>}{state.nodes.map(n=><option value={n.id} key={n.id}>{n.data.analysis.label}</option>)}</select></span><div className="nxt-intelligence-mode"><i/>{status?.enabled&&consent?'Amazon Bedrock · Claude Sonnet 4.6 aktiv':status?.enabled?'Amazon Bedrock verfügbar · Freigabe erforderlich':statusError?'Lokaler Modus · Serverstatus nicht erreichbar':status?.configured?'Amazon Bedrock konfiguriert · noch deaktiviert':'Lokaler Wissens- & Vorlagenmodus'}{!canEdit?' · Nur lesen':''}</div></div>
   <div className="nxt-intelligence-chat" role="log" aria-live="polite" aria-label="Gespräch">
    {!entries.length&&<div className="nxt-intelligence-welcome"><img className="nxt-intelligence-welcome-logo" src={AI_LOGO} alt=""/><strong>Wie kann ich deine Analyse weiterentwickeln?</strong><p>Ich arbeite mit dem ausgewählten Workspace und Knoten. Änderungen werden erst nach deiner Bestätigung übernommen.</p></div>}
    {canEdit&&<div className="nxt-intelligence-suggestions"><small>{status?.enabled&&consent?'Mit KI generieren':'Lokale Vorlagen · KI-Freigabe bei Verfügbarkeit'}</small><button disabled={pending||!selected} onClick={()=>void send('new_dashboard')}><Icon name="layout-dashboard" size={17}/> Dashboard neu aufbauen</button><button disabled={pending||!selected} onClick={()=>void send('dashboard')}><Icon name="plus" size={17}/> Dashboard ergänzen</button><button disabled={pending||!selected} onClick={()=>void send('path')}><Icon name="workflow" size={17}/> Analysepfad erstellen</button></div>}
    {entries.map(entry=>{const plan=entry.plan;const allLabels={...labels};for(const op of plan?.operations||[])if(op.ref)allLabels[op.ref]=op.label||op.ref;const stale=entry.fingerprint!==fingerprint;return <article key={entry.id} className={'nxt-intelligence-message '+entry.role}><small>{entry.role==='user'?'Du':entry.source==='model'?'NXT Intelligence · KI':'NXT Intelligence · Lokal'}</small><p>{entry.text}</p>{!!plan?.operations.length&&<div className="nxt-intelligence-proposal"><b>{plan.operations.length} vorgeschlagene Änderungen</b><ol>{plan.operations.map((op,i)=><li key={i}>{actionLabel(op,allLabels)}</li>)}</ol>{entry.applied?<><span className="nxt-intelligence-applied"><Icon name="check-circle-2" size={15}/> In den Workspace übernommen</span><p className="muted">Im Workspace speichern, um die Änderungen dauerhaft zu sichern.</p><Button icon="layout-dashboard" onClick={onOpenDashboard}>Dashboard öffnen</Button></>:<><Button icon="layout-dashboard" disabled={stale||busy||pending} onClick={()=>setPreview({entry,state})}>Live-Vorschau öffnen</Button><Button kind="primary" icon="check" disabled={stale||!canEdit||busy||pending} onClick={()=>apply(entry)}>Änderungen übernehmen</Button>{stale&&<small>Kontext geändert – bitte neuen Vorschlag erstellen.</small>}</>}</div>}</article>})}
    {pending&&<div className="nxt-intelligence-pending" role="status"><span className="nxt-spinner"/> Analysiere den aktuellen Kontext …</div>}
    {error&&<Notice kind="error">{error}</Notice>}<div ref={end}/>
   </div>
   <footer className="nxt-intelligence-composer">
    {status?.enabled&&<label className="nxt-intelligence-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Workspace-Kontext, Frage und aggregierte Kennzahlen an Amazon Bedrock (EU-Inferenzprofil) senden. Keine Rohdatensätze; keine personenbezogenen Inhalte in Fragen oder Bezeichnungen eingeben.</label>}
    <form onSubmit={e=>{e.preventDefault();void send()}}><textarea ref={input} aria-label="Frage oder Änderungswunsch" rows={3} maxLength={1600} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Frage zu diesem Element oder Änderungswunsch …" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}}/><div><button type="button" className="nxt-intelligence-reset" disabled={pending} onClick={()=>{setThreads(old=>({...old,[scope]:[]}));setError('')}}>Neuer Chat</button><button type="submit" className="nxt-button primary" disabled={!draft.trim()||pending||!selected}><Icon name="arrow-right" size={17}/> Senden</button></div></form>
    <small>Keine automatische Veröffentlichung. Übernommene Änderungen bleiben bis zum Speichern ein Entwurf.</small>{canEdit&&entries.some(e=>e.applied)&&<button type="button" className="nxt-intelligence-reset" disabled={busy||pending} onClick={()=>{onUndo();setError('')}}>Letzte Workspace-Änderung rückgängig</button>}
   </footer>
  </aside>}
  <button ref={launcher} type="button" className={'nxt-intelligence-launcher '+(open?'is-open':'')} aria-expanded={open} aria-label={open?'NXT Intelligence schließen':'NXT Intelligence öffnen'} onClick={()=>open?close():onOpen(true)}>{open?<Icon name="x" size={24}/>:<img src={AI_LOGO} alt=""/>}{!open&&<span>NXT Intelligence</span>}</button>
  {preview&&<IntelligencePreview before={preview.state} plan={preview.entry.plan!} stale={preview.entry.fingerprint!==fingerprint} canApply={canEdit&&!busy&&!pending} onClose={()=>setPreview(null)} onApply={()=>apply(preview.entry)}/>}
 </div>,portalTarget);
}
