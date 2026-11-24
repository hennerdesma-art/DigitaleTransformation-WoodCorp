import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import Icon from './Icon';
import {Button,Notice,IconButton} from './Ui';
import {analysisApi} from '../lib/supabase';
import {intelligenceApi,type AiMessage,type AiStatus} from '../lib/intelligence';
import {actionLabel,applyAssistantPlan,contextForAssistant,localAssistantPlan,type AssistantState} from '../core/assistant';
import {validatePlan,type AiPlan} from '../core/assistantProtocol';
import {effectiveFilters} from '../core/filters';
type Entry=AiMessage&{id:string;plan?:AiPlan;fingerprint?:string;applied?:boolean;source?:'local'|'model'};
type Props={state:AssistantState;workspace:{id:string;title:string;revision:number}|null;fingerprint:string;canEdit:boolean;busy:boolean;onApply:(plan:AiPlan,fingerprint:string)=>void;onUndo:()=>void;open:boolean;onOpen:(open:boolean)=>void};
export function IntelligencePanel({state,workspace,fingerprint,canEdit,busy,onApply,onUndo,open,onOpen}:Props){
 const scope=workspace?.id||'local',scopeRef=useRef(scope),abortRef=useRef<AbortController|null>(null),end=useRef<HTMLDivElement>(null),launcher=useRef<HTMLButtonElement>(null),input=useRef<HTMLTextAreaElement>(null);
 const [threads,setThreads]=useState<Record<string,Entry[]>>({}),[draft,setDraft]=useState(''),[pending,setPending]=useState(false),[status,setStatus]=useState<AiStatus|null>(null),[statusError,setStatusError]=useState(false),[consent,setConsent]=useState(false),[error,setError]=useState('');
 const [portalTarget,setPortalTarget]=useState<Element>(()=>document.fullscreenElement||document.body);
 useEffect(()=>{const update=()=>setPortalTarget(document.fullscreenElement||document.body);document.addEventListener('fullscreenchange',update);return()=>document.removeEventListener('fullscreenchange',update)},[]);
 const entries=threads[scope]||[];
 const selected=state.nodes.find(n=>n.id===state.selectedId);
 const labels:Record<string,string>={};for(const n of state.nodes)labels[n.id]=n.data.analysis.label;for(const d of Object.values(state.dashboards))for(const w of d.widgets)labels[w.id]=w.title;
 useEffect(()=>{scopeRef.current=scope;abortRef.current?.abort();setPending(false);setDraft('');setError('');setConsent(false)},[scope]);
 useEffect(()=>()=>abortRef.current?.abort(),[]);
 useEffect(()=>{if(!open)return;const c=new AbortController();setStatusError(false);intelligenceApi.status(c.signal).then(setStatus).catch(()=>{if(!c.signal.aborted)setStatusError(true)});input.current?.focus();return()=>c.abort()},[open]);
 useEffect(()=>{if(open)end.current?.scrollIntoView({block:'nearest'})},[open,entries.length,pending]);
 useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('.modal-backdrop')){onOpen(false);launcher.current?.focus()}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close)},[open,onOpen]);
 const append=(at:string,entry:Entry)=>setThreads(old=>({...old,[at]:[...(old[at]||[]),entry].slice(-30)}));
 const send=async(template?:'dashboard'|'path')=>{
  const text=template==='dashboard'?'Dashboard ergänzen':template==='path'?'Analysepfad erstellen':draft.trim();
  if(!text||pending||!selected)return;
  const at=scope,stamp=fingerprint,c=new AbortController();abortRef.current?.abort();abortRef.current=c;
  setPending(true);setError('');setDraft('');
  append(at,{id:crypto.randomUUID(),role:'user',text});
  try{
   let result:AiPlan;let source:'local'|'model'='local';
   if(status?.enabled&&consent&&!template){
    source='model';result=await intelligenceApi.ask(text,contextForAssistant(state,workspace,canEdit),entries.slice(-8).map(({role,text})=>({role,text:text.slice(0,1600)})),c.signal);
   }else{
    let metrics=null;
    if(!template){try{metrics=await analysisApi.metrics(effectiveFilters(state.globals,state.nodes.map(n=>n.data.analysis),state.locals,state.selectedId,state.edges))}catch{/* Explicit no-data reply. */}}
    result=localAssistantPlan(text,state,metrics,canEdit,template);
   }
   if(c.signal.aborted||scopeRef.current!==at)return;
   const plan=validatePlan(result,state.nodes.map(n=>n.id),state.allowedFields,canEdit);
   if(plan.operations.length)applyAssistantPlan(state,plan);
   append(at,{id:crypto.randomUUID(),role:'assistant',text:plan.answer,plan,fingerprint:stamp,source});
  }catch(e){if(!c.signal.aborted&&scopeRef.current===at)setError(e instanceof Error?e.message:'Anfrage fehlgeschlagen.')}
  finally{if(!c.signal.aborted&&scopeRef.current===at)setPending(false)}
 };
 const apply=(entry:Entry)=>{
  if(!entry.plan||entry.applied||!canEdit||busy||entry.fingerprint!==fingerprint)return;
  try{onApply(entry.plan,entry.fingerprint);setThreads(old=>({...old,[scope]:(old[scope]||[]).map(e=>e.id===entry.id?{...e,applied:true}:e)}));setError('')}
  catch(e){setError(e instanceof Error?e.message:'Änderungen nicht übernommen.')}
 };
 const close=()=>{onOpen(false);requestAnimationFrame(()=>launcher.current?.focus())};
 return createPortal(<div className="nxt-intelligence-shell">
  {open&&<aside className="nxt-intelligence-panel" role="region" aria-label="NXT Intelligence Assistent">
   <header className="nxt-intelligence-head"><div className="nxt-intelligence-emblem"><Icon name="sparkles" size={23}/></div><div><strong>NXT Intelligence</strong><small>Workspace Copilot</small></div><IconButton name="x" title="Assistent schließen" onClick={close}/></header>
   <div className="nxt-intelligence-context"><span><Icon name="layout-dashboard" size={16}/> Workspace <b title={workspace?.title}>{workspace?.title||'Lokaler Entwurf'}</b></span><span><Icon name="network" size={16}/> Knoten <b title={selected?.data.analysis.label}>{selected?.data.analysis.label||'Keiner ausgewählt'}</b></span><div className="nxt-intelligence-mode"><i/>{status?.enabled&&consent?'KI-Modell aktiv':status?.enabled?'KI verfügbar · lokale Nutzung bis zur Freigabe':statusError?'Lokaler Modus · Serverstatus nicht erreichbar':'Lokaler Wissens- & Vorlagenmodus'}{!canEdit?' · Nur lesen':''}</div></div>
   <div className="nxt-intelligence-chat" role="log" aria-live="polite" aria-label="Gespräch">
    {!entries.length&&<div className="nxt-intelligence-welcome"><Icon name="sparkles" size={27}/><strong>Wie kann ich deine Analyse weiterentwickeln?</strong><p>Ich arbeite mit dem ausgewählten Workspace und Knoten. Änderungen werden erst nach deiner Bestätigung übernommen.</p>{canEdit&&<div className="nxt-intelligence-suggestions"><button disabled={pending} onClick={()=>void send('dashboard')}><Icon name="layout-dashboard" size={17}/> Dashboard ergänzen</button><button disabled={pending} onClick={()=>void send('path')}><Icon name="workflow" size={17}/> Analysepfad vorbereiten</button></div>}</div>}
    {entries.map(entry=>{const plan=entry.plan;const allLabels={...labels};for(const op of plan?.operations||[])if(op.ref)allLabels[op.ref]=op.label||op.ref;const stale=entry.fingerprint!==fingerprint;return <article key={entry.id} className={'nxt-intelligence-message '+entry.role}><small>{entry.role==='user'?'Du':entry.source==='model'?'NXT Intelligence · KI':'NXT Intelligence · Lokal'}</small><p>{entry.text}</p>{!!plan?.operations.length&&<div className="nxt-intelligence-proposal"><b>{plan.operations.length} vorgeschlagene Änderungen</b><ol>{plan.operations.map((op,i)=><li key={i}>{actionLabel(op,allLabels)}</li>)}</ol>{entry.applied?<><span className="nxt-intelligence-applied"><Icon name="check-circle-2" size={15}/> In den Workspace übernommen</span><p className="muted">Im Workspace speichern, um die Änderungen dauerhaft zu sichern.</p></>:<><Button kind="primary" icon="check" disabled={stale||!canEdit||busy||pending} onClick={()=>apply(entry)}>Änderungen übernehmen</Button>{stale&&<small>Kontext geändert – bitte neuen Vorschlag erstellen.</small>}</>}</div>}</article>})}
    {pending&&<div className="nxt-intelligence-pending" role="status"><span className="nxt-spinner"/> Analysiere den aktuellen Kontext …</div>}
    {error&&<Notice kind="error">{error}</Notice>}<div ref={end}/>
   </div>
   <footer className="nxt-intelligence-composer">
    {status?.enabled&&<label className="nxt-intelligence-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Workspace-Kontext und aggregierte Kennzahlen an den konfigurierten KI-Dienst senden (keine Rohdaten).</label>}
    <form onSubmit={e=>{e.preventDefault();void send()}}><textarea ref={input} aria-label="Frage oder Änderungswunsch" rows={3} maxLength={1600} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Frage zu diesem Element oder Änderungswunsch …" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}}/><div><button type="button" className="nxt-intelligence-reset" disabled={pending} onClick={()=>{setThreads(old=>({...old,[scope]:[]}));setError('')}}>Neuer Chat</button><button type="submit" className="nxt-button primary" disabled={!draft.trim()||pending||!selected}><Icon name="arrow-right" size={17}/> Senden</button></div></form>
    <small>Keine automatische Veröffentlichung. Übernommene Änderungen bleiben bis zum Speichern ein Entwurf.</small>{canEdit&&entries.some(e=>e.applied)&&<button type="button" className="nxt-intelligence-reset" disabled={busy||pending} onClick={()=>{onUndo();setError('')}}>Letzte Workspace-Änderung rückgängig</button>}
   </footer>
  </aside>}
  <button ref={launcher} type="button" className={'nxt-intelligence-launcher '+(open?'is-open':'')} aria-expanded={open} aria-label={open?'NXT Intelligence schließen':'NXT Intelligence öffnen'} onClick={()=>open?close():onOpen(true)}><Icon name={open?'x':'sparkles'} size={24}/>{!open&&<span>NXT Intelligence</span>}</button>
 </div>,portalTarget);
}
