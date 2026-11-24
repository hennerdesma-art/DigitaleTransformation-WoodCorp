import React,{useState} from 'react';
import {freshWidget,WIDGET_TYPES,WIDGET_LABELS,normalizeDashboard,type DashboardWidget,type WidgetType} from '../core/dashboard';
import type {AnalysisNode,Filter} from '../core/types';
import type {FieldKey} from '../config';
import {formatFilter} from '../core/filters';
import {Button,Modal,Notice} from './Ui';
import {WidgetInspector} from './DashboardBuilder';
export function CanvasWidgetSettings({node,widget,containers,allowedFields,fieldNames,filters,onRemoveFilter,onSave,onClose}:{node:AnalysisNode;widget:DashboardWidget;containers:AnalysisNode[];allowedFields:FieldKey[];fieldNames:Record<FieldKey,string>;filters:Filter[];onRemoveFilter:(id:string)=>void;onSave:(widget:DashboardWidget,containerId?:string)=>void;onClose:()=>void}){
 const [draft,setDraft]=useState(widget),[group,setGroup]=useState(node.containerId||''),[error,setError]=useState('');
 const changeType=(type:WidgetType)=>setDraft(old=>({...freshWidget(type),id:old.id,title:old.title}));
 return <Modal title="Canvas-Element konfigurieren" onClose={onClose}><form className="node-settings" onSubmit={e=>{e.preventDefault();try{if(!draft.title.trim()||!normalizeDashboard({question:'',widgets:[draft]}))throw Error('Ungültige Element-Einstellungen');onSave({...draft,title:draft.title.trim()},group||undefined);onClose()}catch(e){setError(e instanceof Error?e.message:'Konfiguration ungültig')}}}>
 <label className="field">Titel<input autoFocus required maxLength={100} value={draft.title} onChange={e=>setDraft(old=>({...old,title:e.target.value}))}/></label>
 <label className="field">Elementtyp<select value={draft.type} onChange={e=>changeType(e.target.value as WidgetType)}>{WIDGET_TYPES.map(t=><option value={t} key={t}>{WIDGET_LABELS[t]}</option>)}</select></label>
 <label className="field">Container<select value={group} onChange={e=>setGroup(e.target.value)}><option value="">Freies Element</option>{containers.map(c=><option key={c.id} value={c.id} disabled={c.containerCollapsed&&c.id!==node.containerId}>{c.label}</option>)}</select></label>
 <WidgetInspector canvas widget={draft} onPatch={patch=>setDraft(old=>({...old,...patch,id:old.id,type:old.type}))} onRemove={()=>{}} disabled={false} fieldNames={fieldNames} allowedFields={allowedFields}/>
 <p className="muted">Weitere Darstellungsoptionen direkt im Diagramm oder in der Tabelle öffnen und über „Darstellung speichern“ übernehmen. Größe über die Ziehecke ändern.</p>
 {filters.length>0&&<fieldset className="node-local-filters"><legend>Eigene Filter</legend>{filters.map(f=><div key={f.id}><span>{formatFilter(f,fieldNames)}</span><button type="button" className="nxt-button secondary" onClick={()=>onRemoveFilter(f.id)}>Entfernen</button></div>)}</fieldset>}
 {error&&<Notice kind="error">{error}</Notice>}<div className="modal-actions"><Button onClick={onClose}>Abbrechen</Button><Button type="submit" kind="primary" icon="check">Übernehmen</Button></div>
 </form></Modal>;
}
