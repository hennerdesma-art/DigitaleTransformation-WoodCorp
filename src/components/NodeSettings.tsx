import React,{useState} from 'react';
import type {AnalysisNode,GraphViz,CalculationTemplate} from '../core/types';
import type {FieldKey} from '../config';
import {CALCULATION_TEMPLATES,TEMPLATES,validateRate} from '../core/calculations';
import {FIELD_LABELS} from '../config';
import {Button,Modal,Notice} from './Ui';
const TYPES:{value:GraphViz;label:string}[]=[
 {value:'kpi',label:'KPI-Kachel'}, {value:'donut',label:'Donutdiagramm'},
 {value:'bar',label:'Balkendiagramm'}, {value:'line',label:'Zeitreihe'},
 {value:'calculation',label:'SQL-Kennzahl (geprüfte Vorlage)'}
];
export function NodeSettings({node,allowedFields,fieldNames,onSave,onClose}:{
 node:AnalysisNode;allowedFields:FieldKey[];fieldNames:Record<FieldKey,string>;
 onSave:(patch:Partial<AnalysisNode>)=>void;onClose:()=>void;
}){
 const [name,setName]=useState(node.label),[viz,setViz]=useState<GraphViz>(node.visualization||'kpi');
 const [field,setField]=useState<FieldKey>(node.chartDimension||'delivery_company');
 const [template,setTemplate]=useState<CalculationTemplate>(node.calculationTemplate||'shortfall_kg');
 const [rate,setRate]=useState<string>(node.rateEurPerKg?.toString()||'');
 const [error,setError]=useState('');
 const calc=CALCULATION_TEMPLATES[template];
 const submit=(e:React.FormEvent)=>{e.preventDefault();try{
  if(!name.trim()||name.length>100)throw Error('Bitte einen Namen mit maximal 100 Zeichen eingeben.');
  const parsed=viz==='calculation'?validateRate(template,rate):null;
  onSave({label:name.trim(),visualization:viz,chartDimension:field,calculationTemplate:template,rateEurPerKg:parsed??undefined});
  onClose();
 }catch(e){setError(e instanceof Error?e.message:'Konfiguration ungültig')}};
 return <Modal title="Knoten und Visualisierung konfigurieren" onClose={onClose}>
  <form className="node-settings" onSubmit={submit}>
   <label className="field">Knotenname<input autoFocus maxLength={100} minLength={2} required value={name} onChange={e=>setName(e.target.value)}/></label>
   <label className="field">Anzeigeart<select value={viz} onChange={e=>setViz(e.target.value as GraphViz)}>{TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
   {viz==='bar'&&<label className="field">Gruppierung<select value={field} onChange={e=>setField(e.target.value as FieldKey)}>{[...new Set([...allowedFields,field])].map(key=><option key={key} value={key}>{fieldNames[key]||FIELD_LABELS[key]}</option>)}</select></label>}
   {viz==='calculation'&&<>
    <label className="field">Geprüfte SQL-Vorlage<select value={template} onChange={e=>{setTemplate(e.target.value as CalculationTemplate);setError('')}}>{TEMPLATES.map(key=><option key={key} value={key}>{CALCULATION_TEMPLATES[key].label}</option>)}</select></label>
    <p className="muted">{calc.description}</p>
    {calc.requiresRate&&<label className="field">Bestätigter Kostensatz (€/kg)<input type="number" required step="0.0001" min="0.0001" max="10000" value={rate} onChange={e=>setRate(e.target.value)} placeholder="€/kg selbst eingeben"/></label>}
    <div className="node-sql-preview"><strong>SQL-Vorlage (nur Vorschau)</strong><code>{calc.sql}</code><small>Die Web-App sendet nur die Vorlagen-ID, validierte Filter und ggf. den Kostensatz an eine eingeschränkte Supabase-RPC. Kein frei eingegebenes SQL wird ausgeführt.</small></div>
   </>}
   <p className="muted">Alle Kennzahlen dieser Kachel erben die Filter sämtlicher eingehender Verbindungen. Eigene Filter verengen die Auswahl zusätzlich.</p>
   {error&&<Notice kind="error">{error}</Notice>}
   <div className="modal-actions"><Button onClick={onClose}>Abbrechen</Button><Button type="submit" kind="primary" icon="check">Übernehmen</Button></div>
  </form>
 </Modal>;
}
