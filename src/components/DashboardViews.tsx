import React,{useEffect,useRef,useState} from 'react';
import type {Filter,DashboardData} from '../core/types';
import {METRICS,METRIC_LABELS,type MetricKey,type NodeDashboard} from '../core/dashboard';
import {DashboardRenderer} from './DashboardBuilder';
import Icon from './Icon';
import {Button,Modal} from './Ui';
export type MetricNames=Partial<Record<MetricKey,string>>;
export function KpiNameDialog({names,onSave,onClose}:{names:MetricNames;onSave:(names:MetricNames)=>void;onClose:()=>void}){
 const [draft,setDraft]=useState<MetricNames>(names);
 const save=(e:React.FormEvent)=>{e.preventDefault();const out:MetricNames={};for(const key of METRICS){const next=(draft[key]||'').trim();if(next&&next!==METRIC_LABELS[key])out[key]=next.slice(0,80);}onSave(out);onClose()};
 return <Modal title="KPI-Bezeichnungen anpassen" onClose={onClose}>
  <p className="muted">Diese Titel gelten für deinen Workspace. Formeln, Datendefinitionen und Vergleichswerte bleiben unverändert.</p>
  <form onSubmit={save}><div className="kpi-name-fields">{METRICS.map(key=><label className="field" key={key}>{METRIC_LABELS[key]}<input value={draft[key]??METRIC_LABELS[key]} maxLength={80} onChange={e=>setDraft(old=>({...old,[key]:e.target.value}))} required/></label>)}</div>
   <div className="modal-actions"><Button onClick={onClose}>Abbrechen</Button><Button kind="primary" type="submit" icon="check">Anwenden</Button></div>
  </form>
 </Modal>;
}
export function RenameNodeDialog({label,onSave,onClose}:{label:string;onSave:(value:string)=>void;onClose:()=>void}){
 const [name,setName]=useState(label);
 const submit=(e:React.FormEvent)=>{e.preventDefault();const trimmed=name.trim();if(trimmed){onSave(trimmed);onClose()}};
 return <Modal title="KPI- / Knotennamen ändern" onClose={onClose}><form onSubmit={submit}>
  <p className="muted">Nur der Anzeigename wird geändert. Bestehende Filterverknüpfungen und die zugrunde liegende KPI-Berechnung bleiben unverändert.</p>
  <label className="field">Name<input autoFocus required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
  <div className="modal-actions"><Button onClick={onClose}>Abbrechen</Button><Button kind="primary" type="submit" icon="check">Speichern</Button></div>
 </form></Modal>;
}
export function DashboardFullView({title,dashboard,detail,filters,onClose,onEdit,canEdit}:{
 title:string;dashboard:NodeDashboard;detail:DashboardData;filters:Filter[];onClose:()=>void;onEdit:()=>void;canEdit:boolean;
}){
 const closeRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const prior=document.activeElement instanceof HTMLElement?document.activeElement:null;closeRef.current?.focus();
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose()}};
  document.addEventListener('keydown',onKey);return()=>{document.removeEventListener('keydown',onKey);prior?.focus()};
 },[onClose]);
 return <div className="nxt-dashboard-fullscreen" role="dialog" aria-modal="true" aria-label={'Dashboard '+title}>
  <header className="nxt-dashboard-fullscreen-header">
   <div><span className="nxt-eyebrow">NXT · Knoten-Dashboard</span><h2><Icon name="layout-dashboard" size={25}/>{title}</h2><p>Vollbildansicht · Echtzeit-Kennzahlen im aktuellen Filterkontext</p></div>
   <div className="directory-actions">{canEdit&&<Button icon="settings" onClick={onEdit}>Bearbeiten</Button>}<button ref={closeRef} className="nxt-button primary" onClick={onClose}><Icon name="minimize" size={18}/> Vollbild schließen</button></div>
  </header><main className="nxt-dashboard-fullscreen-body"><DashboardRenderer dashboard={dashboard} detail={detail} filters={filters}/></main>
  <footer className="nxt-dashboard-fullscreen-foot">Escape zum Schließen · Das Dashboard kann jederzeit erneut geöffnet werden.</footer>
 </div>;
}
