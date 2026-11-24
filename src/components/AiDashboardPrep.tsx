import React,{useState} from 'react';
import {DRAFT_TOPICS,createDashboardDraft,type DraftTopic} from '../core/aiDraft';
import {WIDGET_ICONS,WIDGET_LABELS,type NodeDashboard} from '../core/dashboard';
import type {FieldKey} from '../config';
import Icon from './Icon';
import {Button,Modal,Notice} from './Ui';
export function AiDashboardPrep({nodeLabel,existingCount,allowedFields,onApply,onClose}:{nodeLabel:string;existingCount:number;allowedFields:FieldKey[];onApply:(d:NodeDashboard)=>void;onClose:()=>void}){
 const [topic,setTopic]=useState<DraftTopic>('executive'),[question,setQuestion]=useState(''),[preview,setPreview]=useState<NodeDashboard|null>(null),[error,setError]=useState('');
 const prepare=()=>{try{setPreview(createDashboardDraft(topic,question,allowedFields));setError('')}catch(e){setError(e instanceof Error?e.message:'Vorlage konnte nicht vorbereitet werden')}};
 return <Modal title="NXT Intelligence · AI Dashboard Builder" onClose={onClose}><div className="nxt-ai-prep">
  <div className="nxt-ai-heading"><Icon name="layout-dashboard" size={28}/><div><strong>Dashboard vorbereiten</strong><p>Analyseziel definieren, Blöcke prüfen, kontrolliert übernehmen.</p></div></div>
  <Notice kind="neutral">Vorbereitungsmodus · Lokale Analysevorlagen, noch keine KI-Anbindung. Es werden keine Prompts oder Daten an einen KI-Anbieter gesendet.</Notice>
  <div className="nxt-ai-target"><Icon name="network" size={18}/> Zielknoten: <b>{nodeLabel}</b></div>
  <label className="field">Analysetyp<select value={topic} onChange={e=>{setTopic(e.target.value as DraftTopic);setPreview(null)}}>{Object.entries(DRAFT_TOPICS).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select></label>
  <label className="field">Forschungsfrage<textarea rows={3} maxLength={700} placeholder={DRAFT_TOPICS[topic].question} value={question} onChange={e=>{setQuestion(e.target.value);setPreview(null)}}/></label>
  <Button icon="layout-dashboard" onClick={prepare}>Vorlage als Vorschau erstellen</Button>
  {preview&&<div className="nxt-ai-preview" aria-live="polite"><strong>{preview.question}</strong><p className="muted">{preview.widgets.length} geprüfte Blöcke · aktuelle Filter und live berechnete Kennzahlen nach Übernahme</p><div className="nxt-ai-block-grid">{preview.widgets.map(w=><div key={w.id} className="nxt-ai-block"><Icon name={WIDGET_ICONS[w.type]} size={20}/><div><strong>{w.title}</strong><small>{WIDGET_LABELS[w.type]}</small></div></div>)}</div>{preview.widgets.length<DRAFT_TOPICS[topic].types.length&&<Notice kind="warning">Nicht freigegebene Filterdimensionen wurden aus der Vorlage ausgeschlossen.</Notice>}{existingCount>0&&<p className="muted">Bei Übernahme werden die {existingCount} bestehenden Dashboard-Blöcke dieses Knotens ersetzt. Andere Knoten bleiben unverändert.</p>}</div>}
  {error&&<Notice kind="error">{error}</Notice>}
  <div className="modal-actions"><Button onClick={onClose}>Abbrechen</Button><Button kind="primary" icon="check" disabled={!preview||!preview.widgets.length} onClick={()=>{if(preview&&(existingCount===0||confirm('Bestehendes Dashboard dieses Knotens durch die geprüfte Vorlage ersetzen?')))onApply(preview)}}>Vorlage übernehmen</Button></div>
 </div></Modal>;
}
