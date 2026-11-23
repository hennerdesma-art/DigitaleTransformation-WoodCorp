import React,{useMemo,useState} from 'react';
import type {WorkspaceRecord} from '../lib/workspaces';
import type {Role} from '../core/types';
import Icon from './Icon';
import {Button,Modal} from './Ui';

type Scope='all'|'mine'|'shared'|'other';
export function WorkspaceOverview({items,userId,role,busy,onOpen,onCreate,onDelete,onRefresh}:{
 items:WorkspaceRecord[];userId:string;role:Role;busy:boolean;
 onOpen:(id:string)=>void;onCreate:(title:string)=>void;onDelete:(id:string)=>Promise<void>;onRefresh:()=>void;
}){
 const [scope,setScope]=useState<Scope>('all');
 const [query,setQuery]=useState('');
 const [newName,setNewName]=useState('');
 const [creating,setCreating]=useState(false);
 const [deleteTarget,setDeleteTarget]=useState<WorkspaceRecord|null>(null);
 const [deleteConfirm,setDeleteConfirm]=useState(''),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState('');
 const confirmDelete=async(e:React.FormEvent)=>{
  e.preventDefault();
  if(!deleteTarget||deleteConfirm!==deleteTarget.title)return;
  setDeleting(true);setDeleteError('');
  try{await onDelete(deleteTarget.id);setDeleteTarget(null);setDeleteConfirm('')}
  catch(err){setDeleteError(err instanceof Error?err.message:'Workspace konnte nicht gelöscht werden.')}
  finally{setDeleting(false)}
 };
 const counts=useMemo(()=>({
  all:items.length,mine:items.filter(w=>w.owner_id===userId).length,
  shared:items.filter(w=>w.owner_id!==userId&&w.visibility==='team'&&w.status==='published').length,
  other:items.filter(w=>w.owner_id!==userId&&!(w.visibility==='team'&&w.status==='published')).length
 }),[items,userId]);
 const filtered=useMemo(()=>items.filter(w=>{
  const mine=w.owner_id===userId;
  const shared=w.visibility==='team'&&w.status==='published';
  const matches=scope==='all'||(scope==='mine'&&mine)||(scope==='shared'&&!mine&&shared)||(scope==='other'&&!mine&&!shared);
  return matches&&[w.title,w.description].join(' ').toLowerCase().includes(query.trim().toLowerCase());
 }),[items,scope,query,userId]);
 const canCreate=role==='admin'||role==='analyst';
 return <section className="content-page workspace-overview">
  <header className="directory-heading">
   <div><div className="nxt-eyebrow">NXT · Digital Transformation</div><h2><Icon name="layers" size={27}/> Workspaces</h2><p className="muted">Alle für dich freigegebenen Analyseumgebungen – private Entwürfe und veröffentlichte Team-Workspaces.</p></div>
   <div className="directory-actions"><Button icon="refresh-cw" onClick={onRefresh} disabled={busy}>Aktualisieren</Button>{canCreate&&<Button kind="primary" icon="plus" onClick={()=>setCreating(true)}>Neuer Workspace</Button>}</div>
  </header>
  <div className="workspace-counts">
   <div><Icon name="layers"/><strong>{counts.all}</strong><span>Sichtbare Workspaces</span></div>
   <div><Icon name="lock"/><strong>{counts.mine}</strong><span>Meine Workspaces</span></div>
   <div><Icon name="share-2"/><strong>{counts.shared}</strong><span>Von anderen geteilt</span></div>
   {role==='admin'&&<div><Icon name="user-round"/><strong>{counts.other}</strong><span>Andere private (Admin)</span></div>}
  </div>
  <div className="workspace-searchbar">
   <label className="workspace-search"><Icon name="search" size={18}/><input type="search" aria-label="Workspaces durchsuchen" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Workspace oder Forschungsfrage suchen …"/></label>
   <div className="workspace-tabs" role="group" aria-label="Workspace-Ansichten">
   {([['all','Alle sichtbaren',counts.all],['mine','Meine',counts.mine],['shared','Mit mir geteilt',counts.shared],...(role==='admin'?[['other','Andere private',counts.other]]:[])] as [Scope,string,number][]).map(([key,label,n])=><button type="button" key={key} onClick={()=>setScope(key)} aria-pressed={scope===key} className={scope===key?'current':''}>{label}<small>{n}</small></button>)}
   </div>
  </div>
  {busy&&<p className="workspace-pending" role="status"><Icon name="refresh-cw" size={16}/> Workspaces werden aktualisiert …</p>}
  {!filtered.length?<div className="standard-card workspace-empty"><Icon name="layers" size={35}/><h3>Keine passenden Workspaces</h3><p>Ändere den Suchbegriff oder erstelle deinen ersten Workspace.</p></div>:
   <div className="workspace-card-grid">{filtered.map(w=>{
    const mine=w.owner_id===userId,shared=w.visibility==='team'&&w.status==='published';
    const nodeCount=w.document?.graph?.nodes?.length??0;
    const dashboardCount=Object.keys(w.document?.dashboards||{}).length;
    const privateOther=!mine&&!shared;const canDelete=role==='admin'||(mine&&canCreate);
    return <article key={w.id} className={'workspace-overview-card '+(shared?'shared':'private')}>
      <div className="workspace-card-top"><span className="workspace-card-icon"><Icon name={shared?'share-2':'network'} size={22}/></span><span className={'workspace-card-badge '+(shared?'shared':'')}>{shared?'Team · Geteilt':mine?'Privat':'Privat · Admin'}</span></div>
      <h3>{w.title}</h3><p>{w.description||'Interaktive Analyse mit Decision Tree und individuellen Kennzahlen.'}</p>
      <div className="workspace-card-meta"><span><Icon name="network" size={15}/>{nodeCount} Knoten</span><span><Icon name="layout-dashboard" size={15}/>{dashboardCount} Dashboards</span></div>
      <div className="workspace-card-bottom"><small>{mine?'Von dir erstellt':privateOther?'Anderer Eigentümer · Adminansicht':'Von einem Teammitglied veröffentlicht'}<br/>Aktualisiert: {new Date(w.updated_at).toLocaleDateString('de-DE')}</small><div className="workspace-card-actions">{canDelete&&<Button icon="trash-2" disabled={busy} onClick={()=>{setDeleteTarget(w);setDeleteConfirm('');setDeleteError('')}}>Löschen</Button>}
    <Button icon="chevron-right" kind={shared?'primary':'secondary'} onClick={()=>onOpen(w.id)}>Öffnen</Button></div></div>
    </article>
   })}</div>}
  <p className="workspace-privacy-note"><Icon name="lock" size={15}/> Private Inhalte anderer Mitglieder bleiben durch Supabase-Zugriffsregeln geschützt. Nur Administratoren können sie verwalten. Eine zusätzliche Workspace-Baumhierarchie kann später auf dieser Übersicht aufbauen.</p>
  {creating&&<Modal title="Privaten Workspace erstellen" onClose={()=>setCreating(false)}>
    <form className="workspace-create-dialog-form" onSubmit={e=>{e.preventDefault();if(!newName.trim())return;onCreate(newName.trim());setNewName('');setCreating(false)}}>
      <label className="field">Name<input autoFocus value={newName} maxLength={120} minLength={2} required onChange={e=>setNewName(e.target.value)}/></label>
      <div className="modal-actions"><Button onClick={()=>setCreating(false)}>Abbrechen</Button><Button type="submit" kind="primary" icon="plus">Erstellen</Button></div>
    </form>
   </Modal>}
  {deleteTarget&&<Modal title="Workspace unwiderruflich löschen" onClose={()=>{if(!deleting)setDeleteTarget(null)}}>
    <form onSubmit={e=>{void confirmDelete(e)}} className="workspace-delete-confirm">
      <p>Der Workspace <strong>{deleteTarget.title}</strong> wird dauerhaft entfernt. Seine Knoten, Filter und Dashboard-Konfigurationen gehen verloren. Die WoodCorp-Rohdaten und andere Workspaces bleiben erhalten.</p>
      <label className="field">Zur Bestätigung den Workspace-Namen exakt eingeben
       <input autoFocus value={deleteConfirm} autoComplete="off" onChange={e=>setDeleteConfirm(e.target.value)} placeholder={deleteTarget.title} required/>
      </label>
      {deleteError&&<div role="alert" className="workspace-delete-error">{deleteError}</div>}
      <div className="modal-actions"><Button disabled={deleting} onClick={()=>setDeleteTarget(null)}>Abbrechen</Button>
       <Button type="submit" kind="danger" icon="trash-2" disabled={busy||deleting||deleteConfirm!==deleteTarget.title}>{deleting?'Lösche …':'Workspace löschen'}</Button></div>
    </form>
   </Modal>}
 </section>;
}
