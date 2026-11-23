import React,{useState} from 'react';
import type {WorkspaceRecord,FilterCatalogRow} from '../lib/workspaces';
import type {Role} from '../core/types';
import Icon from './Icon';
import {Button,Modal,Notice} from './Ui';

export function WorkspaceControls({workspaces,active,canEdit,onSelect,onCreate,onSave,onToggleShare,onRemove,saving,role}: {
 workspaces:WorkspaceRecord[];active:WorkspaceRecord|null;canEdit:boolean;
 onSelect:(id:string)=>void;onCreate:(name:string)=>void;onSave:()=>void;
 onToggleShare:()=>void;onRemove:()=>void;saving:boolean;role:Role;
}){
 const [dialog,setDialog]=useState(false),[title,setTitle]=useState('Meine Analyse');
 return <div className="workspace-select-row"><Icon name="layers" size={18}/><label>Workspace
   <select aria-label="Aktuellen Workspace auswählen" value={active?.id||'local'} onChange={e=>onSelect(e.target.value)}>
    <option value="local">Lokale Analyse (noch nicht geteilt)</option>{workspaces.map(w=><option key={w.id} value={w.id}>{w.title} · {w.visibility==='team'&&w.status==='published'?'Team':'Privat'}</option>)}
   </select>
  </label>
  <span className={'workspace-pill '+(active?.visibility==='team'&&active.status==='published'?'':'private')}>{active?(active.visibility==='team'&&active.status==='published'?'Team · Veröffentlicht':'Privater Entwurf'):'Lokal'}</span>
  <div className="workspace-spacer"/>
  {role!=='viewer'&&<><Button icon="plus" onClick={()=>setDialog(true)}>Neu</Button><Button kind="primary" icon="save" disabled={!canEdit||saving} onClick={onSave}>{saving?'Speichert …':'In Supabase speichern'}</Button></>}
  {active&&canEdit&&<><Button icon="share-2" onClick={onToggleShare}>{active.visibility==='team'&&active.status==='published'?'Privat stellen':'Für Team freigeben'}</Button><button className="nxt-button secondary" title="Workspace löschen" onClick={onRemove}><Icon name="trash-2" size={17}/></button></>}
  {dialog&&<Modal title="Neuen Workspace erstellen" onClose={()=>setDialog(false)}><form className="workspace-name-dialog" onSubmit={e=>{e.preventDefault();if(title.trim()){onCreate(title.trim());setDialog(false)}}}>
    <label className="field">Bezeichnung<input autoFocus maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} required/></label><p className="muted">Der neue Workspace startet als privater Entwurf und kann anschließend für das Team freigegeben werden.</p><div className="modal-actions"><Button onClick={()=>setDialog(false)}>Abbrechen</Button><Button type="submit" kind="primary" icon="plus">Erstellen</Button></div>
   </form></Modal>}
 </div>;
}

export function FilterCatalogPage({rows,admin,busy,onRefresh,onToggle}:{rows:FilterCatalogRow[];admin:boolean;busy:boolean;onRefresh:()=>void;onToggle:(key:FilterCatalogRow['field_key'],next:boolean)=>void}){
 return <section className="content-page"><h2>Filterbibliothek</h2><p className="muted">Zentrale Freigabe der tatsächlich vorhandenen und serverseitig geprüften Analysefelder.</p><div className="standard-card"><div className="card-heading"><h3>Freigegebene Dimensionen</h3><Button icon="refresh-cw" onClick={onRefresh} disabled={busy}>Aktualisieren</Button></div>
 <div className="table-overflow"><table className="filter-config-table"><thead><tr><th>Dimension</th><th>Datenbankfeld</th><th>Status</th><th>Aktion</th></tr></thead><tbody>{rows.map(r=><tr key={r.field_key}><td>{r.display_name}</td><td><code>{r.field_key}</code></td><td>{r.enabled?<span className="status-good">Aktiviert</span>:<span className="muted">Deaktiviert</span>}</td><td><label className="catalog-toggle"><input type="checkbox" checked={r.enabled} disabled={!admin||busy} onChange={e=>onToggle(r.field_key,e.target.checked)}/>{r.enabled?'Verfügbar':'Ausgeblendet'}</label></td></tr>)}</tbody></table></div></div>
 <Notice kind="warning">Neue Filterfelder dürfen erst nach Prüfung der Datenbankspalten und einer Erweiterung der serverseitigen Allowlist ergänzt werden. Das Deaktivieren blendet eine Dimension bei neuen Analysen aus; bereits gespeicherte Filter bleiben nachvollziehbar.</Notice></section>;
}