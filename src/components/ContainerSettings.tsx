import React,{useState} from 'react';
import type {AnalysisNode,ContainerTone,Filter} from '../core/types';
import type {FieldKey} from '../config';
import {CONTAINER_DEFAULT} from '../core/graph';
import {formatFilter} from '../core/filters';
import {Button,Modal,Notice} from './Ui';
export function ContainerSettings({node,filters,fieldNames,onRemoveFilter,onSave,onClose}:{node:AnalysisNode;filters:Filter[];fieldNames:Record<FieldKey,string>;onRemoveFilter:(id:string)=>void;onSave:(patch:Partial<AnalysisNode>)=>void;onClose:()=>void}){
 const [name,setName]=useState(node.label),[description,setDescription]=useState(node.description||''),[tone,setTone]=useState<ContainerTone>(node.containerTone||'teal');
 const [width,setWidth]=useState(node.containerWidth??CONTAINER_DEFAULT.width),[height,setHeight]=useState(node.containerHeight??CONTAINER_DEFAULT.height),[error,setError]=useState('');
 const submit=(e:React.FormEvent)=>{e.preventDefault();try{
  if(name.trim().length<2||name.trim().length>100||!Number.isFinite(width)||!Number.isFinite(height)||width<320||height<160||width>4000||height>4000)throw Error('Bitte gültigen Namen und Maße angeben.');
  onSave({label:name.trim(),description:description.trim(),containerTone:tone,containerWidth:width,containerHeight:height});onClose();
 }catch(e){setError(e instanceof Error?e.message:'Konfiguration ungültig')}};
 return <Modal title="Container konfigurieren" onClose={onClose}><form className="node-settings" onSubmit={submit}>
 <label className="field">Titel<input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>
 <label className="field">Beschreibung<textarea rows={2} maxLength={240} value={description} onChange={e=>setDescription(e.target.value)}/></label>
 <label className="field">Farbvariante<select value={tone} onChange={e=>setTone(e.target.value as ContainerTone)}><option value="teal">NXT Türkis</option><option value="slate">Graphit</option><option value="sand">Sand</option></select></label>
 <div className="nxt-container-dimensions"><label className="field">Breite (Canvas px)<input type="number" min={320} max={4000} required value={width} onChange={e=>setWidth(e.target.valueAsNumber)}/></label><label className="field">Höhe (Canvas px)<input type="number" min={160} max={4000} required value={height} onChange={e=>setHeight(e.target.valueAsNumber)}/></label></div>
 <p className="muted">Die Maße werden bei Bedarf automatisch erweitert, damit alle enthaltenen Blöcke Platz haben.</p>
 {!!filters.length&&<fieldset className="node-local-filters"><legend>Eigene Containerfilter</legend>{filters.map(f=><div key={f.id}><span>{formatFilter(f,fieldNames)}</span><button type="button" className="nxt-button secondary" onClick={()=>onRemoveFilter(f.id)}>Entfernen</button></div>)}</fieldset>}
 <Notice>Ein- und ausgehende Pfeile verwenden den gemeinsamen Filterkontext. Lokale Filter der enthaltenen Blöcke bleiben voneinander getrennt.</Notice>
 {error&&<Notice kind="error">{error}</Notice>}<div className="modal-actions"><Button onClick={onClose}>Abbrechen</Button><Button type="submit" kind="primary" icon="check">Übernehmen</Button></div>
 </form></Modal>;
}
