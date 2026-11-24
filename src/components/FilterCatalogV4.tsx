import React,{useMemo,useState} from 'react';
import type {FilterCandidate,FilterCatalogRow} from '../lib/workspaces';
import {FILTER_GROUPS,filterGroup,FILTER_KIND,type FieldKey} from '../config';
import Icon from './Icon';
import {Button,Modal,Notice} from './Ui';

export function FilterCatalogV4({rows,candidates,admin,busy,onRefresh,onToggle,onRegister,onRename}:{
 rows:FilterCatalogRow[];candidates:FilterCandidate[];admin:boolean;busy:boolean;
 onRefresh:()=>void;onToggle:(field:FieldKey,enabled:boolean)=>void;
 onRegister:(field:FieldKey,name:string)=>Promise<void>;onRename:(field:FieldKey,name:string)=>Promise<void>;
}){
 const [adding,setAdding]=useState(false);
 const [candidate,setCandidate]=useState<FieldKey>('cust_market');
 const [label,setLabel]=useState('Kundenmarkt');
 const [renameId,setRenameId]=useState<FieldKey|null>(null),[renameText,setRenameText]=useState('');
 const [error,setError]=useState('');const [search,setSearch]=useState('');const [group,setGroup]=useState('all');
 const filtered=useMemo(()=>rows.filter(r=>(group==='all'||filterGroup(r.field_key)===group)&&(r.display_name+' '+r.field_key).toLowerCase().includes(search.trim().toLowerCase())).sort((a,b)=>FILTER_GROUPS.indexOf(filterGroup(a.field_key))-FILTER_GROUPS.indexOf(filterGroup(b.field_key))||a.sort_order-b.sort_order),[rows,group,search]);
 const available=useMemo(()=>candidates.filter(c=>c.available&&!rows.some(r=>r.field_key===c.field_key)),[rows,candidates]);
 const addNew=async(e:React.FormEvent)=>{e.preventDefault();setError('');try{await onRegister(candidate,label);setAdding(false)}catch(e){setError(e instanceof Error?e.message:'Filterprüfung fehlgeschlagen')}};
 const rename=async(e:React.FormEvent)=>{e.preventDefault();if(!renameId)return;setError('');try{await onRename(renameId,renameText);setRenameId(null)}catch(e){setError(e instanceof Error?e.message:'Umbenennung fehlgeschlagen')}};
 return <section className="content-page">
  <header className="directory-heading"><div><div className="nxt-eyebrow">NXT · Filterkonfiguration</div><h2><Icon name="filter" size={27}/> Filterbibliothek</h2><p className="muted">Zentral verwaltete Dimensionen – neue Felder werden mit realen Daten und einer serverseitigen Allowlist validiert.</p></div>
  <div className="directory-actions"><Button icon="refresh-cw" onClick={onRefresh} disabled={busy}>Aktualisieren</Button>{admin&&<Button kind="primary" icon="plus" disabled={busy||!available.length} onClick={()=>{const first=available[0];if(first){setCandidate(first.field_key);setLabel(first.suggested_name);setAdding(true);setError('')}}}>Filter hinzufügen</Button>}</div></header>
  <div className="standard-card filter-catalog-v4">
   <div className="card-heading"><h3>Registrierte Filter <small>({rows.length})</small></h3><span className="muted">Nur Administratoren können Freigaben und Namen ändern.</span></div>
   <div className="nxt-filter-library-tools"><label className="field">Filter suchen<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name oder Feld …"/></label><label className="field">Bereich<select value={group} onChange={e=>setGroup(e.target.value)}><option value="all">Alle Bereiche</option>{FILTER_GROUPS.map(g=><option key={g} value={g}>{g}</option>)}</select></label></div><p className="muted">{filtered.length} von {rows.length} Filtern · {rows.filter(r=>r.enabled).length} aktiv</p>
   <div className="table-overflow"><table><thead><tr><th>Bereich</th><th>Anzeigename</th><th>Datenbankfeld</th><th>Status</th><th>Aktionen</th></tr></thead><tbody>
   {filtered.map(r=><tr key={r.field_key}><td>{filterGroup(r.field_key)}</td><td><strong>{r.display_name}</strong></td><td><code>{r.field_key}</code><small className="muted"> · {FILTER_KIND(r.field_key)==='category'?'Kategorie':FILTER_KIND(r.field_key)==='date'?'Datum':'Zahl'}</small></td><td>{r.enabled?<span className="status-good">Aktiv</span>:<span className="muted">Deaktiviert</span>}</td><td><div className="filter-catalog-actions">{admin&&<><Button icon="settings" disabled={busy} onClick={()=>{setRenameId(r.field_key);setRenameText(r.display_name);setError('')}}>Umbenennen</Button><label className="catalog-toggle"><input type="checkbox" disabled={busy} checked={r.enabled} onChange={e=>onToggle(r.field_key,e.target.checked)}/>{r.enabled?'Verfügbar':'Ausblenden'}</label></>}{!admin&&<span className="muted">Nur Lesen</span>}</div></td></tr>)}
   {!filtered.length&&<tr><td colSpan={5}>Keine Filter gefunden.</td></tr>}</tbody></table></div>
  </div>
  <div className="standard-card filter-catalog-about"><Icon name="check-circle-2" size={22}/><div><h3>Serverseitig geprüft</h3><p>Registrierte Filter umfassen geprüfte WoodCorp-Quellfelder und abgeleitete Case-Prozessmerkmale. Filter wirken anschließend auf denselben KPI-Berechnungsweg wie der Decision Tree. Die Bezeichnung ist frei änderbar, das Datenbankfeld bleibt unverändert.</p><p className="muted">Kategorien, Zahlenbereiche und Datumsfilter verwenden validierte Operatoren. Freies SQL ist nicht möglich. Die Auswahl für große Kategorien ist durchsuchbar.</p></div></div>
  {adding&&<Modal title="Neuen Filter hinzufügen" onClose={()=>setAdding(false)}>
   <form onSubmit={addNew}><p className="muted">Wähle ein überprüftes, noch nicht registriertes Feld. Keine unkontrollierten SQL-Abfragen.</p>
    <label className="field">Datenfeld<select value={candidate} onChange={e=>{const v=e.target.value as FieldKey;setCandidate(v);setLabel(available.find(c=>c.field_key===v)?.suggested_name||v)}}>
     {available.map(c=><option key={c.field_key} value={c.field_key}>{c.suggested_name} · {c.distinct_values} Werte</option>)}</select></label>
    <label className="field">Anzeigename<input maxLength={80} minLength={2} required value={label} onChange={e=>setLabel(e.target.value)}/></label>
    {error&&<Notice kind="error">{error}</Notice>}
    <div className="modal-actions"><Button onClick={()=>setAdding(false)}>Abbrechen</Button><Button kind="primary" type="submit" disabled={busy}>Prüfen & hinzufügen</Button></div>
   </form>
  </Modal>}
  {renameId&&<Modal title="Filter umbenennen" onClose={()=>setRenameId(null)}><form onSubmit={rename}>
    <p className="muted">Nur der sichtbare Name ändert sich. Das zugrunde liegende Feld und alle Berechnungen bleiben identisch.</p>
    <label className="field">Anzeigename<input autoFocus minLength={2} maxLength={80} required value={renameText} onChange={e=>setRenameText(e.target.value)}/></label>
    {error&&<Notice kind="error">{error}</Notice>}
    <div className="modal-actions"><Button onClick={()=>setRenameId(null)}>Abbrechen</Button><Button kind="primary" type="submit" disabled={busy}>Namen speichern</Button></div>
   </form></Modal>}
 </section>;
}
