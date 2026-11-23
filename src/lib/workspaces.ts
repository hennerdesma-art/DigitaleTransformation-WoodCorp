import {supabase} from './supabase';
import type {FieldKey} from '../config';
import type {WorkspaceDocument} from '../core/dashboard';

export type WorkspaceVisibility='private'|'team';
export type WorkspaceStatus='draft'|'published';
export type WorkspaceRecord={
 id:string;owner_id:string;title:string;description:string;visibility:WorkspaceVisibility;
 status:WorkspaceStatus;revision:number;document:WorkspaceDocument;updated_at:string;created_at:string;
};
export type FilterCatalogRow={field_key:FieldKey;display_name:string;enabled:boolean;sort_order:number;updated_at:string};
const WORKSPACE_COLS='id,owner_id,title,description,visibility,status,revision,document,updated_at,created_at';

export const workspacesApi={
 async list():Promise<WorkspaceRecord[]>{
  const {data,error}=await supabase.from('nxt_workspaces').select(WORKSPACE_COLS).order('updated_at',{ascending:false}).limit(80);
  if(error)throw Error('Workspaces konnten nicht geladen werden: '+error.message);
  return (data||[]) as unknown as WorkspaceRecord[];
 },
 async create(ownerId:string,document:WorkspaceDocument,title:string):Promise<WorkspaceRecord>{
  const safe=title.trim().slice(0,120);if(!safe)throw Error('Name fehlt');
  const {data,error}=await supabase.from('nxt_workspaces').insert({owner_id:ownerId,document,title:safe,visibility:'private',status:'draft'}).select(WORKSPACE_COLS).single();
  if(error)throw Error('Workspace konnte nicht erstellt werden: '+error.message);
  return data as unknown as WorkspaceRecord;
 },
 async save(current:WorkspaceRecord,document:WorkspaceDocument):Promise<WorkspaceRecord>{
  const {data,error}=await supabase.rpc('nxt_save_workspace',{p_id:current.id,p_expected_revision:current.revision,p_document:document});
  if(error)throw Error(error.message.includes('WORKSPACE_REVISION')?'Der Workspace wurde zwischenzeitlich geändert. Bitte neu laden und Änderungen vergleichen.':'Speichern fehlgeschlagen: '+error.message);
  const row=Array.isArray(data)?data[0]:data;
  if(!row?.new_revision)throw Error('Server hat keine Version zurückgegeben');
  return {...current,document,revision:Number(row.new_revision),updated_at:String(row.saved_at)};
 },
 async updateMetadata(current:WorkspaceRecord,updates:{title?:string;visibility?:WorkspaceVisibility;status?:WorkspaceStatus}):Promise<WorkspaceRecord>{
  const payload={...updates,revision:current.revision+1,updated_at:new Date().toISOString()};
  const {data,error}=await supabase.from('nxt_workspaces').update(payload).eq('id',current.id).eq('revision',current.revision).select(WORKSPACE_COLS).maybeSingle();
  if(error)throw Error('Freigabe fehlgeschlagen: '+error.message);
  if(!data)throw Error('Workspace wurde parallel bearbeitet. Bitte neu laden.');
  return data as unknown as WorkspaceRecord;
 },
 async remove(id:string):Promise<void>{
  const {error}=await supabase.from('nxt_workspaces').delete().eq('id',id);
  if(error)throw Error('Löschen nicht möglich: '+error.message);
 },
 async catalog():Promise<FilterCatalogRow[]>{
  const {data,error}=await supabase.from('nxt_filter_catalog').select('field_key,display_name,enabled,sort_order,updated_at').order('sort_order');
  if(error)throw Error('Filterbibliothek konnte nicht geladen werden: '+error.message);
  return (data||[]) as FilterCatalogRow[];
 },
 async updateCatalog(field:FieldKey,enabled:boolean):Promise<FilterCatalogRow>{
  const {data,error}=await supabase.from('nxt_filter_catalog').update({enabled,updated_at:new Date().toISOString()}).eq('field_key',field).select('field_key,display_name,enabled,sort_order,updated_at').single();
  if(error)throw Error('Filterstatus konnte nicht gespeichert werden: '+error.message);
  return data as FilterCatalogRow;
 }
};