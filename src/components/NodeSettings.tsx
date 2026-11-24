import React,{useState} from 'react';
import type {AnalysisNode,GraphViz,CalculationTemplate,Filter} from '../core/types';
import type {FieldKey} from '../config';
import {CALCULATION_TEMPLATES,TEMPLATES,validateRate} from '../core/calculations';
import {FIELD_LABELS,CHART_SEGMENT_FIELDS} from '../config';
import {Button,Modal,Notice} from './Ui';
import {METRICS,METRIC_LABELS,type MetricKey} from '../core/dashboard';
import {formatFilter} from '../core/filters';
import {E02_KEYS,E02_INTERVALS,type E02IntervalKey} from '../core/processIntervals';
const TYPES:{value:GraphViz;label:string}[]=[
 {value:'kpi',label:'KPI-Kachel'}, {value:'donut',label:'Donutdiagramm'},
 {value:'bar',label:'Balkendiagramm'}, {value:'line',label:'Zeitreihe'},
 {value:'calculation',label:'SQL-Kennzahl (geprüfte Vorlage)'},
 {value:'stacked',label:'Gestapelte OTIF-Fehlerklassen'},
 {value:'stacked100',label:'100%-Stack nach OTIF-Klassen'},
 {value:'heatmap',label:'Heatmap Werk × Produkttyp'},
 {value:'pareto',label:'Pareto: Vertragsstrafen'},
 {value:'scatter',label:'Scatter: Aufträge × OTIF'},
 {value:'waterfall',label:'Kosten-Wasserfall'},
 {value:'histogram',label:'Häufigkeitsverteilung'},
 {value:'treemap',label:'Kosten-Treemap'},
 {value:'funnel',label:'OTIF-Funnel'},
 {value:'process_interval',label:'E02 · Prozessintervall (Median/P90)'}
];
export function NodeSettings({node,allowedFields,fieldNames,filters,containers=[],onRemoveFilter,onSave,onClose}:{
 node:AnalysisNode;containers?:AnalysisNode[];allowedFields:FieldKey[];fieldNames:Record<FieldKey,string>;filters:Filter[];onRemoveFilter:(id:string)=>void;
 onSave:(patch:Partial<AnalysisNode>)=>void;onClose:()=>void;
}){
 const [containerId,setContainerId]=useState(node.containerId||'');
 const [name,setName]=useState(node.label),[viz,setViz]=useState<GraphViz>(node.visualization||'kpi');
 const [selectedMetric,setSelectedMetric]=useState<MetricKey>((node.metricId==='otd'?'onTimeRate':node.metricId&&METRICS.includes(node.metricId as MetricKey)?node.metricId:'otifRate') as MetricKey);
 const [field,setField]=useState<FieldKey>(node.chartDimension||'delivery_company');
 const [interval,setInterval]=useState<E02IntervalKey>(node.intervalKey||'order_to_production');
 const [template,setTemplate]=useState<CalculationTemplate>(node.calculationTemplate||'total_penalty_eur');
 const [rate,setRate]=useState<string>(node.rateEurPerKg?.toString()||'');
 const [error,setError]=useState('');
 const calc=CALCULATION_TEMPLATES[template];
 const suggestedNames:Record<GraphViz,string>={kpi:'Neue KPI',donut:'Donut · On-Time',bar:'Balken · Segmentvergleich',line:'Zeitreihe · On-Time',calculation:'Vertragsstrafe · 0,75 €/kg',stacked:'OTIF-Klassen · gestapelt',stacked100:'OTIF-Klassen · 100 %',heatmap:'OTIF-Heatmap',pareto:'Vertragsstrafen · Pareto',scatter:'Aufträge und OTIF',waterfall:'Kosten-Zerlegung',histogram:'Mengenänderungen · Verteilung',treemap:'Kostenanteile · Treemap',funnel:'OTIF-Funnel',process_interval:'E02 · Prozessintervall'};
 const isSuggested=(label:string)=>Object.values(suggestedNames).includes(label)||label==='SQL · Unterlieferte Menge'||TEMPLATES.some(id=>CALCULATION_TEMPLATES[id].label===label);
 const changeVisual=(next:GraphViz)=>{if(isSuggested(name))setName(suggestedNames[next]);setViz(next)};
 const changeTemplate=(next:CalculationTemplate)=>{if(isSuggested(name))setName(CALCULATION_TEMPLATES[next].label);setTemplate(next);setError('')};
 const submit=(e:React.FormEvent)=>{e.preventDefault();try{
  if(!name.trim()||name.length>100)throw Error('Bitte einen Namen mit maximal 100 Zeichen eingeben.');
  const parsed=viz==='calculation'?validateRate(template,rate):null;
  onSave({label:name.trim(),containerId:containerId||undefined,visualization:viz,metricId:selectedMetric,chartDimension:field,calculationTemplate:template,rateEurPerKg:parsed??undefined,intervalKey:interval});
  onClose();
 }catch(e){setError(e instanceof Error?e.message:'Konfiguration ungültig')}};
 return <Modal title="Knoten und Visualisierung konfigurieren" onClose={onClose}>
  <form className="node-settings" onSubmit={submit}>
   <label className="field">Knotenname<input autoFocus maxLength={100} minLength={2} required value={name} onChange={e=>setName(e.target.value)}/></label>
   {!!containers.length&&<label className="field">Container / Gruppierung<select value={containerId} onChange={e=>setContainerId(e.target.value)}><option value="">Kein Container</option>{containers.map(c=><option key={c.id} value={c.id} disabled={!!c.containerCollapsed&&c.id!==node.containerId}>{c.label}{c.containerCollapsed?' (eingeklappt)':''}</option>)}</select><small className="muted">Die Gruppe vererbt ihren Filterkontext. Bestehende Pfeile bleiben erhalten.</small></label>}
   <label className="field">Anzeigeart<select value={viz} onChange={e=>changeVisual(e.target.value as GraphViz)}>{TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
   {viz==='kpi'&&<label className="field">Kennzahl<select value={selectedMetric} onChange={e=>setSelectedMetric(e.target.value as MetricKey)}>{METRICS.map(m=><option key={m} value={m}>{METRIC_LABELS[m]}</option>)}</select></label>}
   {(['bar','stacked','stacked100','heatmap','pareto','scatter','treemap'].includes(viz))&&<label className="field">Gruppierung<select value={field} onChange={e=>setField(e.target.value as FieldKey)}>{[...new Set([...allowedFields.filter(f=>viz==='heatmap'?['factory','product_type'].includes(f):CHART_SEGMENT_FIELDS.includes(f)),field])].map(key=><option key={key} value={key}>{fieldNames[key]||FIELD_LABELS[key]}</option>)}</select></label>}
   {viz==='process_interval'&&<label className="field">Intervall<select value={interval} onChange={e=>setInterval(e.target.value as E02IntervalKey)}>{E02_KEYS.map(k=><option key={k} value={k}>{E02_INTERVALS[k].title}</option>)}</select></label>}
   {viz==='calculation'&&<>
    <label className="field">Geprüfte SQL-Vorlage<select value={template} onChange={e=>changeTemplate(e.target.value as CalculationTemplate)}>{TEMPLATES.map(key=><option key={key} value={key}>{CALCULATION_TEMPLATES[key].label}</option>)}</select></label>
    <p className="muted">{calc.description}</p>
    {calc.requiresRate&&<label className="field">Bestätigter Kostensatz (€/kg)<input type="number" required step="0.0001" min="0.0001" max="10000" value={rate} onChange={e=>setRate(e.target.value)} placeholder="€/kg selbst eingeben"/></label>}
    <div className="node-sql-preview"><strong>SQL-Vorlage (nur Vorschau)</strong><code>{calc.sql}</code><small>Die Web-App sendet nur die Vorlagen-ID, validierte Filter und ggf. den Kostensatz an eine eingeschränkte Supabase-RPC. Kein frei eingegebenes SQL wird ausgeführt.</small></div>
   </>}
   {!!filters.length&&<fieldset className="node-local-filters"><legend>Eigene Filter dieses Knotens</legend>{filters.map(f=><div key={f.id}><span><b>{formatFilter(f,fieldNames)}</b></span><button className="nxt-button secondary" type="button" onClick={()=>onRemoveFilter(f.id)} aria-label={'Filter '+f.value+' entfernen'}>Entfernen</button></div>)}</fieldset>}
   <p className="muted">Alle Kennzahlen dieser Kachel erben die Filter sämtlicher eingehender Verbindungen. Eigene Filter verengen die Auswahl zusätzlich.</p>
   {error&&<Notice kind="error">{error}</Notice>}
   <div className="modal-actions"><Button onClick={onClose}>Abbrechen</Button><Button type="submit" kind="primary" icon="check">Übernehmen</Button></div>
  </form>
 </Modal>;
}
