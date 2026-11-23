import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ReactFlowProvider,useEdgesState,useNodesState,useReactFlow,type Connection,type EdgeChange,type NodeChange,type Viewport} from '@xyflow/react';
import {FIELD_LABELS,FIELDS,PROJECT,type FieldKey} from './config';
import {analysisApi,memberApi,supabase} from './lib/supabase';
import {effectiveFilters,labels,makeFilter,toBackend,validateFilters} from './core/filters';
import {ROOT_ID,createInitialGraph,splitGraph,nodeFor,referenceEdge,isValidReference,cleanDraft,serializeDraft,restoreDraft,type NNode,type NEdge} from './core/graph';
import type {Filter,Role,Ribbon,Metrics,TrendRow,BreakdownRow,PaletteType,DashboardData,SavedDraft,AnalysisNode} from './core/types';
import {CanvasWithFlow} from './components/GraphCanvas';
import Icon from './components/Icon';
import {Brand,Button,IconButton,Modal,Notice,Spinner,number,percent,decimal,SmallTrend} from './components/Ui';
import AuthScreen from './components/AuthScreen';

type View='home'|'analytics'|'tree'|'builder'|'data'|'filters'|'team'|'profile';
const NAV:{id:View;label:string;icon:string;admin?:boolean}[]=[
 {id:'home',label:'Home',icon:'house'}, {id:'analytics',label:'KPI-Analyse',icon:'chart-column'},
 {id:'tree',label:'Decision Tree',icon:'network'}, {id:'builder',label:'Dashboard Builder',icon:'layout-dashboard'},
 {id:'data',label:'Datenquellen',icon:'database'}, {id:'filters',label:'Filterbibliothek',icon:'filter'},
 {id:'team',label:'Team & Zugänge',icon:'user-round',admin:true},{id:'profile',label:'Konfiguration',icon:'settings'}
];
const emptyDetail:DashboardData={metrics:null,trend:[],breakdown:[],pending:false,error:null};
const fmtDate=(value:string|null|undefined)=>value?new Date(value).toLocaleDateString('de-DE'):'–';
const isEditing=(role:Role|null)=>role==='admin'||role==='analyst';

function FilterDialog({target,dimensions,onApply,onClose}:{target:{kind:'global'|'node';id?:string};dimensions:Record<string,string[]>;onApply:(f:Filter)=>void;onClose:()=>void}){
 const [field,setField]=useState<FieldKey>('factory');const [value,setValue]=useState('');const entries=FIELDS.filter(f=>(dimensions[f]||[]).length>0);
 useEffect(()=>{setValue(dimensions[field]?.[0]||'');},[field,dimensions]);
 return <Modal title={target.kind==='global'?'Globalen Filter hinzufügen':'Filter für ausgewählten Knoten'} onClose={onClose}>
  <p className="muted">{target.kind==='global'?'Dieser Filter gilt für alle Analysen und den KPI-Header.':'Dieser Filter gilt nur für den Knoten und seine analytischen Nachfahren – niemals für Geschwister.'}</p>
  <form onSubmit={e=>{e.preventDefault();try{onApply(makeFilter(field,value,target.kind==='global'?'global':'local'));onClose();}catch(e){alert(e instanceof Error?e.message:'Fehler beim Filter')}}}>
   <label className="field">Dimension<select value={field} onChange={e=>setField(e.target.value as FieldKey)}>{entries.map(f=><option key={f} value={f}>{FIELD_LABELS[f]}</option>)}</select></label>
   <label className="field">Wert<select value={value} onChange={e=>setValue(e.target.value)}>{(dimensions[field]||[]).map(v=><option value={v} key={v}>{v}</option>)}</select></label>
   <div className="modal-actions"><Button onClick={onClose}>Abbrechen</Button><Button kind="primary" icon="check" type="submit" disabled={!value}>Filter anwenden</Button></div>
  </form>
 </Modal>;
}
function SplitDialog({nodeName,dimensions,onSplit,onClose}:{nodeName:string;dimensions:Record<string,string[]>;onSplit:(f:FieldKey)=>Promise<void>;onClose:()=>void}){
 const [field,setField]=useState<FieldKey>('product_type');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 return <Modal title="Knoten aufgliedern" onClose={onClose}><p className="muted"><b>{nodeName}</b> wird nach einer zugelassenen Dimension in analytische Teilgruppen zerlegt. Diese Teilgruppen erben automatisch die Knotenfilter.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await onSplit(field);onClose();}catch(e){setError(e instanceof Error?e.message:'Aufgliederung nicht möglich');}finally{setBusy(false)}}}>
  <label className="field">Split-Dimension<select value={field} onChange={e=>setField(e.target.value as FieldKey)}>{FIELDS.filter(f=>dimensions[f]?.length).map(f=><option key={f} value={f}>{FIELD_LABELS[f]}</option>)}</select></label>
  {error&&<Notice kind="error">{error}</Notice>}
  <div className="modal-actions"><Button onClick={onClose}>Abbrechen</Button><Button type="submit" kind="primary" icon="split" disabled={busy}>Aufgliedern</Button></div>
 </form></Modal>;
}
function Header({userEmail,onSignOut,onProfile,onSearch,onHelp}:{userEmail:string;onSignOut:()=>void;onProfile:()=>void;onSearch:(value:string)=>void;onHelp:()=>void}){
 const [search,setSearch]=useState('');const [focus,setFocus]=useState(false);
 useEffect(()=>{const fn=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.getElementById('nxt-search')?.focus();}};window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)},[]);
 return <header className="app-header"><Brand/><div className="header-separator"/><div className="header-project"><strong>NXT Analytics</strong><small>Digital Transformation</small></div>
 <div className="header-search"><Icon name="search" size={18}/><input aria-label="Analysen, Knoten und Seiten durchsuchen" placeholder="Analysen, Dashboards, Knoten, Filter …" id="nxt-search" value={search} onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)} onChange={e=>{setSearch(e.target.value);onSearch(e.target.value)}}/><kbd>Strg + K</kbd></div>
 <div className="header-actions"><IconButton name="circle-help" title="Hilfe zur Analyse" onClick={onHelp}/><IconButton name="settings" title="Kontoeinstellungen" onClick={onProfile}/><div className="user-avatar" title={userEmail}>{userEmail?.split('@')[0]?.split('.')?.map(s=>s[0]?.toUpperCase()).join('').slice(0,2)||'NX'}</div><IconButton name="log-out" title="Abmelden" onClick={onSignOut}/></div></header>;
}
function Sidebar({view,onNavigate,collapsed,setCollapsed,role}:{view:View;onNavigate:(v:View)=>void;collapsed:boolean;setCollapsed:(v:boolean)=>void;role:Role|null}){
 return <aside className={'navigation '+(collapsed?'collapsed':'')} aria-label="Hauptnavigation"><nav><button className="nav-toggle" type="button" onClick={()=>setCollapsed(!collapsed)} aria-label={collapsed?'Navigation ausklappen':'Navigation einklappen'} title={collapsed?'Navigation ausklappen':'Navigation einklappen'}><Icon name={collapsed?'panel-left-open':'panel-left-close'} size={18}/>{!collapsed&&'Navigation'}</button>
 {NAV.filter(n=>!n.admin||role==='admin').map(n=><button className={'nav-entry '+(n.id===view?'active':'')} key={n.id} aria-current={n.id===view?'page':undefined} onClick={()=>onNavigate(n.id)} title={n.label} type="button"><Icon name={n.icon} size={19}/>{!collapsed&&<span>{n.label}</span>}</button>)}
 </nav><div className="nav-spacer"/><div className="nav-bottom">{!collapsed&&<><div className="nav-label"><Icon name="star" size={16}/> FAVORITEN</div><button type="button" onClick={()=>onNavigate('analytics')}><Icon name="target" size={16}/> On-Time Delivery</button><p>WoodCorp · O2C</p></>}<div className="nav-dots" aria-hidden="true"/></div></aside>;
}
function MetricRibbon({ribbon,trend,pending}:{ribbon:Ribbon|null;trend:TrendRow[];pending:boolean}){
 const values=trend.filter(r=>r.on_time_rate!=null).map(t=>Number(t.on_time_rate));
 const cards=[
  {title:'On-Time Delivery',value:percent(ribbon?.onTimeRate),icon:'target',unit:'Lieferdatum ≤ Zusage',highlight:true,graph:values},
  {title:'Aufträge',value:number(ribbon?.orders),icon:'package',unit:'Aufträge in Auswahl'},
  {title:'Ø Lieferverzug',value:ribbon?.avgDelayDays==null?'–':decimal(ribbon.avgDelayDays)+' Tage',icon:'clock-3',unit:'Nur verspätete Lieferungen'},
  {title:'Verspätete Aufträge',value:number(ribbon?.lateOrders),icon:'triangle-alert',unit:'Lieferdatum > Zusage'},
  {title:'Betroffene Werke',value:ribbon?`${ribbon.affectedFactories} / ${ribbon.factories}`:'–',icon:'factory',unit:'Werke mit Verspätungen'}
 ];
 return <div className="kpi-ribbon">{cards.map(c=><section className={'ribbon-card '+(c.highlight?'featured':'')} key={c.title} title={c.unit}><div className="ribbon-symbol"><Icon name={c.icon} size={23}/></div><div className="ribbon-content"><h3>{c.title}</h3><div className="ribbon-value">{pending&&!ribbon?'…':c.value}</div><small>{c.unit}</small></div>{c.graph&&<SmallTrend values={c.graph}/>}</section>)}</div>;
}
function FilterStrip({globals,onRemove,onAdd,onReset,onShare}:{globals:Filter[];onRemove:(id:string)=>void;onAdd:()=>void;onReset:()=>void;onShare:()=>void}){
 return <div className="filter-strip"><div className="filter-title"><Icon name="filter" size={17}/> Aktive Filter <b>({globals.length})</b></div><div className="filter-chips">{globals.map(f=><div className="filter-chip" key={f.id}><span>{FIELD_LABELS[f.field]}: <b>{f.value}</b></span><button title="Filter entfernen" aria-label={'Filter '+FIELD_LABELS[f.field]+' '+f.value+' entfernen'} onClick={()=>onRemove(f.id)}>×</button></div>)}{!globals.length&&<span className="no-filters">Alle Werke · alle historischen Lieferungen</span>}</div>
 <button className="filter-add" onClick={onAdd}><Icon name="plus" size={17}/> Filter</button><IconButton name="refresh-cw" title="Globale Filter zurücksetzen" disabled={!globals.length} onClick={onReset}/><IconButton name="share-2" title="Gefilterte Ansicht teilen" onClick={onShare}/></div>;
}
function TrendChart({rows}:{rows:TrendRow[]}){
 const valid=rows.filter(r=>r.on_time_rate!=null);if(!valid.length)return <div className="chart-empty">Keine Zeitreihe für die aktuelle Auswahl</div>;
 const W=480,H=177,pad=37;const pts=valid.map((v,i)=>({x:pad+i*(W-pad-18)/Math.max(valid.length-1,1),y:14+(H-42)*(100-Number(v.on_time_rate))/100}));
 const points=pts.map(p=>p.x+','+p.y).join(' ');
 return <><svg viewBox="0 0 480 179" className="trend-svg" role="img" aria-label="On-Time Delivery im Verlauf der Monate">{[0,25,50,75,100].map(v=><g key={v}><line x1="37" x2="465" y1={14+(H-42)*(100-v)/100} y2={14+(H-42)*(100-v)/100} stroke="#e4ecee"/><text x="2" y={18+(H-42)*(100-v)/100} fontSize="11" fill="#64797e">{v}%</text></g>)}
 <polyline points={points} fill="none" stroke="#008B92" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>{pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="2.8" fill="#fff" stroke="#008B92" strokeWidth="1.8"/>)}
 <text x="37" y="177" fill="#64797e" fontSize="11">{valid[0].month}</text><text x="464" y="177" textAnchor="end" fill="#64797e" fontSize="11">{valid[valid.length-1].month}</text></svg>
 <details className="accessible-table"><summary>Daten als Tabelle</summary><table><thead><tr><th>Monat</th><th>Aufträge</th><th>Pünktlich</th></tr></thead><tbody>{valid.map(r=><tr key={r.month}><td>{r.month}</td><td>{number(r.orders)}</td><td>{percent(r.on_time_rate)}</td></tr>)}</tbody></table></details></>;
}
function BarChart({rows}:{rows:BreakdownRow[]}){
 const filtered=rows.filter(r=>r.label!=null&&r.on_time_rate!=null).slice(0,7);
 if(!filtered.length)return <div className="chart-empty">Keine Vergleichsdaten verfügbar</div>;
 return <div className="bar-chart">{filtered.map(r=><div className="bar-row" key={r.label}><span title={r.label||''}>{r.label}</span><div className="bar-track"><div style={{width:Math.max(0,Math.min(100,Number(r.on_time_rate)))+'%'}}/></div><b>{percent(r.on_time_rate)}</b></div>)}</div>;
}
function DetailPanel({node,detail,tab,setTab,onClose,onFilter}:{node:NNode|undefined;detail:DashboardData;tab:string;setTab:(v:string)=>void;onClose:()=>void;onFilter:()=>void}){
 if(!node)return <section className="detail-panel"><div className="detail-header"><strong>Knoten-Dashboard</strong></div><div className="chart-empty">Knoten im Analysebaum auswählen.</div></section>;
 const m=detail.metrics;const late=detail.ribbon?.lateOrders;const tabs=['Übersicht','Details','Treiber','Vergleich'];
 return <aside className="detail-panel"><div className="detail-header"><div><Icon name="layers" size={20}/><div><strong>Knoten-Dashboard: {node.data.analysis.label}</strong><small>{node.data.analysis.predicate?FIELD_LABELS[node.data.analysis.predicate.field]:'Kennzahl'} · WoodCorp O2C</small></div></div><IconButton name="x" title="Detailbereich schließen" onClick={onClose}/></div>
 <nav className="detail-tabs" aria-label="Dashboard-Ansichten">{tabs.map(t=><button key={t} className={t===tab?'selected':''} aria-current={t===tab?'page':undefined} onClick={()=>setTab(t)}>{t}</button>)}</nav>
 {detail.pending&&!m?<Spinner text="Knotenkennzahlen werden geladen …"/>:detail.error?<Notice kind="error">{detail.error}</Notice>:<div className="detail-body">
 {tab==='Übersicht'&&<><div className="detail-feature"><Icon name="target" size={25}/><div><small>On-Time Delivery ({node.data.analysis.label})</small><strong>{percent(m?.onTimeRate)}</strong><span>{number(m?.dateCoverage)} Lieferungen mit Datumsangaben</span></div></div>
 <div className="detail-two"><div className="stat-box"><Icon name="file-text" size={18}/><small>Aufträge</small><b>{number(m?.orders)}</b></div><div className="stat-box"><Icon name="triangle-alert" size={18}/><small>Nicht pünktlich</small><b>{number(late)}</b></div></div>
 <div className="chart-box"><h3>On-Time Delivery – Verlauf</h3><TrendChart rows={detail.trend}/></div>
 <div className="chart-box"><h3>Lieferunternehmen im Vergleich</h3><BarChart rows={detail.breakdown}/></div></>}
 {tab==='Details'&&<div className="chart-box"><h3>Kennzahlen und Datenumfang</h3><dl className="detail-list"><dt>Aufträge</dt><dd>{number(m?.orders)}</dd><dt>Pünktliche Lieferungen</dt><dd>{percent(m?.onTimeRate)}</dd><dt>Mengentreue</dt><dd>{percent(m?.volumeConformanceRate)}</dd><dt>Vollständige Liefertermine</dt><dd>{number(m?.dateCoverage)}</dd><dt>Früheste Lieferung</dt><dd>{fmtDate(m?.firstDelivery)}</dd><dt>Späteste Lieferung</dt><dd>{fmtDate(m?.lastDelivery)}</dd></dl></div>}
 {tab==='Treiber'&&<><Notice kind="warning">Dies sind beobachtete Segmentunterschiede, keine nachgewiesenen Ursachen.</Notice><div className="chart-box"><h3>Potenzielle Einflussbereiche · Lieferunternehmen</h3><BarChart rows={detail.breakdown}/></div></>}
 {tab==='Vergleich'&&<div className="chart-box"><h3>Vergleich nach Lieferunternehmen</h3><div className="table-overflow"><table><thead><tr><th>Lieferunternehmen</th><th>Aufträge</th><th>On-Time</th></tr></thead><tbody>{detail.breakdown.map((r,i)=><tr key={r.label||i}><td>{r.label||'Ohne Angabe'}</td><td>{number(r.orders)}</td><td>{percent(r.on_time_rate)}</td></tr>)}</tbody></table></div></div>}
 <button className="detail-refine" onClick={onFilter}><Icon name="filter" size={17}/> Diesen Knoten filtern</button><p className="dashboard-foot">Datenquelle: Supabase · Case-basiert · Historische Daten {PROJECT.years}</p></div>}</aside>;
}
function TeamPanel({role}:{role:Role}){
 const [members,setMembers]=useState<Array<{user_id:string;email?:string;role:Role;confirmed?:boolean}>>([]);const [email,setEmail]=useState('');const [roleNew,setRoleNew]=useState<Role>('viewer');const [delivery,setDelivery]=useState('email');const [link,setLink]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const getToken=async()=>{const r=await supabase.auth.getSession();return r.data.session?.access_token||''};
 const reload=useCallback(async()=>{try{const r=await memberApi({action:'list'},await getToken());setMembers(r.members||[]);}catch(e){setError(e instanceof Error?e.message:'Mitglieder konnten nicht geladen werden.')}},[]);
 useEffect(()=>{if(role==='admin')void reload()},[role,reload]);
 if(role!=='admin')return <Notice kind="error">Administratorrechte erforderlich.</Notice>;
 const invite=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');setLink('');try{const r=await memberApi({action:'invite',email,role:roleNew,delivery},await getToken());if(r.link)setLink(r.link);else setError('Einladungs-E-Mail angefordert. Prüfe den Posteingang der Zielperson.');await reload();}catch(e){setError(e instanceof Error?e.message:'Einladung fehlgeschlagen.')}finally{setBusy(false)}};
 const changeRole=async(id:string,next:Role)=>{try{await memberApi({action:'role',userId:id,role:next},await getToken());await reload()}catch(e){setError(e instanceof Error?e.message:'Rolle konnte nicht geändert werden.')}};
 const remove=async(id:string)=>{if(!confirm('Zugriff dieses Mitglieds entfernen?'))return;try{await memberApi({action:'remove',userId:id},await getToken());await reload()}catch(e){setError(e instanceof Error?e.message:'Fehler bei der Entfernung.')}};
 return <section className="content-page"><h2>Team & Zugänge</h2><p className="muted">Einladung und Rollenverwaltung über die bestehende geschützte Supabase-Schnittstelle.</p>
 <div className="standard-card"><h3>Mitglied einladen</h3><form className="team-form" onSubmit={invite}><label className="field">E-Mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="field">Rolle<select value={roleNew} onChange={e=>setRoleNew(e.target.value as Role)}><option value="viewer">Viewer</option><option value="analyst">Analyst</option><option value="admin">Administrator</option></select></label><label className="field">Versand<select value={delivery} onChange={e=>setDelivery(e.target.value)}><option value="email">Per E-Mail</option><option value="link">Einmaligen Link erzeugen</option></select></label><Button type="submit" disabled={busy} kind="primary" icon="plus">Einladen</Button></form>
 {link&&<div className="generated-link"><label>Einmaliger Link (nur an Zielperson senden)<input readOnly value={link} onFocus={e=>e.target.select()}/></label><Button icon="copy" onClick={()=>navigator.clipboard?.writeText(link)}>Kopieren</Button></div>}{error&&<Notice>{error}</Notice>}</div>
 <div className="standard-card"><div className="card-heading"><h3>Mitglieder</h3><Button onClick={reload} icon="refresh-cw">Aktualisieren</Button></div><div className="table-overflow"><table><thead><tr><th>E-Mail</th><th>Status</th><th>Rolle</th><th>Aktion</th></tr></thead><tbody>{members.map(m=><tr key={m.user_id}><td>{m.email||m.user_id}</td><td>{m.confirmed?'Bestätigt':'Ausstehend'}</td><td><select value={m.role} onChange={e=>changeRole(m.user_id,e.target.value as Role)}><option value="viewer">Viewer</option><option value="analyst">Analyst</option><option value="admin">Admin</option></select></td><td><Button kind="danger" icon="trash-2" onClick={()=>remove(m.user_id)}>Entfernen</Button></td></tr>)}</tbody></table></div></div></section>;
}
function DataPage(){return <section className="content-page"><h2>Datenquellen</h2><p className="muted">Verifizierter Datenbestand des Projekts WoodCorp Process Intelligence</p><div className="data-grid"><div className="standard-card"><Icon name="database"/><h3>woodcorp_cases</h3><b>19.953</b><small>Aufträge · Schlüssel case_key</small></div><div className="standard-card"><Icon name="network"/><h3>woodcorp_activities</h3><b>210.135</b><small>Ereignisse · Referenz case_key</small></div><div className="standard-card"><Icon name="lock"/><h3>RLS & Auth</h3><b>Geschützt</b><small>Persönliche Projektberechtigung</small></div></div><Notice kind="warning">Datenqualität: Das historische Flag <code>order_date_met</code> weicht bei 9.618 Aufträgen vom Vergleich <code>delivered_date ≤ promised_date</code> ab. Die aktuelle On-Time-Kennzahl verwendet den Datumsvergleich.</Notice></section>}
function FilterLibrary({dimensions,admin}:{dimensions:Record<string,string[]>;admin:boolean}){
 return <section className="content-page"><h2>Filterbibliothek</h2><p className="muted">Aktuell vom Datenbankserver validierte Filterfelder – weitere Datentypen und Administratorfreigaben folgen mit Phase 4/5.</p><div className="standard-card"><table><thead><tr><th>Dimension</th><th>Datenfeld</th><th>Werte</th><th>Status</th></tr></thead><tbody>{FIELDS.map(f=><tr key={f}><td>{FIELD_LABELS[f]}</td><td><code>{f}</code></td><td>{(dimensions[f]||[]).length}</td><td><span className="status-good">Freigegeben</span></td></tr>)}</tbody></table></div>{admin&&<Notice>Neue Filterfelder benötigen eine serverseitig geprüfte Allowlist und Datenberechtigungen; die Bearbeitung des Filterkatalogs folgt in der nächsten Ausbaustufe.</Notice>}</section>;
}
function ProfilePage({email,role}:{email:string;role:Role|null}){const [pw,setPw]=useState('');const [notice,setNotice]=useState('');const submit=async(e:React.FormEvent)=>{e.preventDefault();if(pw.length<12){setNotice('Mindestens 12 Zeichen erforderlich');return;}const {error}=await supabase.auth.updateUser({password:pw});setNotice(error?error.message:'Passwort geändert');if(!error)setPw('')};return <section className="content-page"><h2>Konfiguration</h2><div className="standard-card profile"><h3>Mein Profil</h3><p><b>Adresse:</b> {email}</p><p><b>Rolle:</b> {role}</p><form onSubmit={submit}><label className="field">Neues Passwort<input type="password" minLength={12} autoComplete="new-password" value={pw} onChange={e=>setPw(e.target.value)} required/></label><Button kind="primary" type="submit" icon="lock">Passwort ändern</Button></form>{notice&&<Notice>{notice}</Notice>}</div></section>}

function AnalyticsWorkspace({userId,role,email,onSignOut}:{userId:string;role:Role;email:string;onSignOut:()=>void}){
 const flow=useReactFlow<NNode,NEdge>();const [view,setView]=useState<View>('analytics');const [collapsed,setCollapsed]=useState(false);
 const [globals,setGlobals]=useState<Filter[]>([]);const [locals,setLocals]=useState<Record<string,Filter[]>>({});
 const [dimensions,setDimensions]=useState<Record<string,string[]>>({});const [ribbon,setRibbon]=useState<Ribbon|null>(null);const [rootMetrics,setRootMetrics]=useState<Metrics|null>(null);const [ribbonTrend,setRibbonTrend]=useState<TrendRow[]>([]);
 const [selectedId,setSelectedId]=useState(ROOT_ID);const [selectedTab,setSelectedTab]=useState('Übersicht');const [detail,setDetail]=useState<DashboardData>(emptyDetail);
 const [nodes,setNodes,onNodesChange]=useNodesState<NNode>([nodeFor({id:ROOT_ID,parentId:null,label:'On-Time Delivery',kind:'root',createdBy:'system'}, {x:550,y:35})]);
 const [edges,setEdges,onEdgesChange]=useEdgesState<NEdge>([]);const [editMode,setEditMode]=useState(false);const [rightVisible,setRightVisible]=useState(true);const [fullscreen,setFullscreen]=useState(false);const [busy,setBusy]=useState(true);const [warning,setWarning]=useState('');const [toast,setToast]=useState('');
 const [dialog,setDialog]=useState<{kind:'global'|'node'|'split';id?:string}|null>(null);const [help,setHelp]=useState(false);const [search,setSearch]=useState('');const [dirty,setDirty]=useState(false);const [loaded,setLoaded]=useState(false);const [reloadKey,setReloadKey]=useState(0);
 const viewportRef=useRef<Viewport>({x:0,y:0,zoom:1});const requestRef=useRef(0);const detailRequest=useRef(0);const undoRef=useRef<Array<{nodes:NNode[];edges:NEdge[]}>>([]);const redoRef=useRef<Array<{nodes:NNode[];edges:NEdge[]}>>([]);const initializedRef=useRef(false);
 const localKey='nxt-v2-layout:'+userId;
 const say=useCallback((s:string)=>{setToast(s);},[]);
 useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),4200);return()=>clearTimeout(t)}},[toast]);
 const handleSetView=(next:View)=>{setView(next);if(next==='builder')setEditMode(isEditing(role));if(next==='tree'||next==='analytics')setRightVisible(true)};
 const analysisNodes=useMemo(()=>nodes.map(n=>n.data.analysis),[nodes]);
 const selectedNode=nodes.find(n=>n.id===selectedId);
 const effective=useCallback((id=selectedId)=>effectiveFilters(globals,analysisNodes,locals,id),[globals,analysisNodes,locals,selectedId]);
 const snapshot=useCallback(()=>({nodes:structuredClone(nodes),edges:structuredClone(edges)}),[nodes,edges]);
 const remember=useCallback(()=>{undoRef.current=[...undoRef.current.slice(-29),snapshot()];redoRef.current=[];setDirty(true)},[snapshot]);
 const undo=useCallback(()=>{const prev=undoRef.current.pop();if(!prev)return;redoRef.current.push(snapshot());setNodes(prev.nodes);setEdges(prev.edges);setDirty(true)},[setNodes,setEdges,snapshot]);
 const redo=useCallback(()=>{const prev=redoRef.current.pop();if(!prev)return;undoRef.current.push(snapshot());setNodes(prev.nodes);setEdges(prev.edges);setDirty(true)},[setNodes,setEdges,snapshot]);
 const onNodeChanges=useCallback((changes:NodeChange<NNode>[])=>{onNodesChange(changes);if(editMode&&changes.some(c=>c.type==='position'))setDirty(true)},[onNodesChange,editMode]);
 const onEdgeChanges=useCallback((changes:EdgeChange<NEdge>[])=>{if(!editMode)return;onEdgesChange(changes);setDirty(true)},[onEdgesChange,editMode]);
 const connect=useCallback((c:Connection)=>{if(!editMode||!c.source||!c.target)return;if(!isValidReference(c.source,c.target,edges)){say('Verbindung ungültig oder bereits vorhanden');return;}
  remember();setEdges(e=>[...e,referenceEdge(c.source!,c.target!)]);say('Visuelle Referenzverbindung hinzugefügt – keine Filtervererbung.');},[edges,editMode,remember,setEdges,say]);
 const saveDraft=()=>{try{const data=serializeDraft(nodes,edges,locals,viewportRef.current);localStorage.setItem(localKey,JSON.stringify(data));setDirty(false);say('Entwurf lokal auf diesem Gerät gespeichert. Gemeinsame Datenbank-Speicherung folgt in Phase 5.')}catch(e){say(e instanceof Error?e.message:'Speichern fehlgeschlagen')}};
 const resetCamera=()=>{void flow.fitView({padding:.17,duration:250})};
 const resetDraft=()=>{if(!confirm('Lokalen Entwurf verwerfen und Werk-Baum neu laden?'))return;localStorage.removeItem(localKey);initializedRef.current=false;setLocals({});setLoaded(false);setReloadKey(i=>i+1);say('Lokaler Entwurf zurückgesetzt')};
 const addNode=useCallback((type:PaletteType,position:{x:number;y:number})=>{if(!editMode){say('Zum Hinzufügen zuerst den Bearbeitungsmodus aktivieren.');return;}
  if(type==='connector'){say('Connector: Ziehe einen Verbindungspunkt an einem Knoten zu einem anderen Verbindungspunkt.');return;}
  remember();const label=type==='metric'?'Neue KPI':type==='note'?'Neue Anmerkung':type==='condition'?'Neuer Filterknoten':'Neue Aufgliederung';
  const analysis:AnalysisNode={id:'user:'+crypto.randomUUID(),parentId:null,label,kind:type==='metric'?'metric':type==='note'?'note':type==='condition'?'condition':'segment',createdBy:'user',description:type==='note'?'Doppelklick zum Bearbeiten':undefined};
  setNodes(ns=>[...ns,nodeFor(analysis,position)]);setSelectedId(analysis.id);say('Knoten hinzugefügt. Konfiguriere ihn über den ausgewählten Knoten.');
 },[editMode,remember,setNodes,say]);
 const removeNode=(id:string)=>{const n=nodes.find(n=>n.id===id);if(!editMode||n?.data.analysis.createdBy!=='user')return;if(!confirm('Knoten und seine Verbindungen entfernen?'))return;remember();setNodes(ns=>ns.filter(n=>n.id!==id));setEdges(es=>es.filter(e=>e.source!==id&&e.target!==id));if(selectedId===id)setSelectedId(ROOT_ID);say('Knoten entfernt');};
 const applyFilter=(f:Filter)=>{if(dialog?.kind==='global'){setGlobals(gs=>{try{return validateFilters([...gs,f])}catch(e){say((e as Error).message);return gs}})}else if(dialog?.id){setLocals(old=>{const current=old[dialog.id!]||[];try{return {...old,[dialog.id!]:validateFilters([...current,f])}}catch(e){say((e as Error).message);return old}})} };
 const removeGlobal=(id:string)=>setGlobals(gs=>gs.filter(f=>f.id!==id));
 const share=async()=>{const data={v:1,g:globals.map(({field,op,value})=>({field,op,value})),selected:selectedId};const u=new URL(location.href);u.searchParams.set('view',btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''));try{await navigator.clipboard.writeText(u.toString());say('Link kopiert. Lokale Knotenfilter werden nicht mitgeteilt.')}catch{say('Zwischenablage nicht verfügbar. URL bitte manuell kopieren.')}};
 const triggerReload=()=>setReloadKey(v=>v+1);
 useEffect(()=>{const query=new URLSearchParams(location.search).get('view');if(!query)return;try{const raw=JSON.parse(decodeURIComponent(escape(atob(query.replace(/-/g,'+').replace(/_/g,'/')))));if(raw.v!==1)return;const gs=validateFilters((raw.g||[]).map((f:Filter)=>({...f,id:crypto.randomUUID()})));setGlobals(gs);if(typeof raw.selected==='string')setSelectedId(raw.selected);}catch{say('Ungültiger Ansichtslink ignoriert.')}},[]);
 useEffect(()=>{analysisApi.dimensions().then(setDimensions).catch(e=>setWarning('Filterkatalog konnte nicht geladen werden: '+e.message));},[]);
 useEffect(()=>{const run=++requestRef.current;setBusy(true);setWarning('');const fetchAll=async()=>{
  try{const [rb,m,factories,trend]=await Promise.all([analysisApi.ribbon(globals),analysisApi.metrics(globals),analysisApi.breakdown('factory',globals),analysisApi.trend(globals)]);
   if(run!==requestRef.current)return;setRibbon(rb);setRootMetrics(m);setRibbonTrend(trend);
   if(!initializedRef.current){const base=createInitialGraph(factories,{orders:rb.orders,onTimeRate:rb.onTimeRate});const saved=localStorage.getItem(localKey);
    if(saved){try{const d=cleanDraft(JSON.parse(saved));if(d){const recovered=restoreDraft(d);const counts=new Map(base.nodes.map(n=>[n.id,n.data]));setNodes(recovered.nodes.map(n=>({...n,data:{...n.data,...(counts.get(n.id)||{})}})));setEdges(recovered.edges);setLocals(d.localFilters||{});viewportRef.current=d.viewport;setTimeout(()=>flow.setViewport(d.viewport),150);say('Lokaler Entwurf geladen');}else{setNodes(base.nodes);setEdges(base.edges)}}catch{setNodes(base.nodes);setEdges(base.edges)}}else{setNodes(base.nodes);setEdges(base.edges)}initializedRef.current=true;setLoaded(true);
   }else{const lookup=new Map(factories.map(r=>['factory:'+r.label,r]));setNodes(ns=>ns.map(n=>{if(n.id===ROOT_ID)return {...n,data:{...n.data,orders:rb.orders,onTimeRate:rb.onTimeRate}};if(n.id.startsWith('factory:')){const v=lookup.get(n.id);return {...n,data:{...n.data,orders:v?.orders??null,onTimeRate:v?.on_time_rate??null}}}return {...n,data:{...n.data,orders:null,onTimeRate:null}}}));}
  }catch(e){if(run===requestRef.current)setWarning('Live-Daten konnten nicht geladen werden: '+(e instanceof Error?e.message:String(e)))}finally{if(run===requestRef.current)setBusy(false)}};
  void fetchAll();return()=>{requestRef.current++};
 },[globals,reloadKey]);
 useEffect(()=>{if(!initializedRef.current||!loaded)return;let filt:Filter[];try{filt=effective(selectedId);}catch(e){setDetail({...emptyDetail,error:e instanceof Error?e.message:'Ungültiger Analysezweig'});return}
 const idx=++detailRequest.current;setDetail(old=>({...old,pending:true,error:null,metrics:null,trend:[],breakdown:[]}));
 Promise.all([analysisApi.metrics(filt),analysisApi.trend(filt),analysisApi.breakdown('delivery_company',filt),analysisApi.ribbon(filt)]).then(([metrics,trend,breakdown,ribbon])=>{
  if(idx!==detailRequest.current)return;setDetail({metrics,trend,breakdown,ribbon,pending:false,error:null});
  setNodes(ns=>ns.map(n=>n.id===selectedId?{...n,data:{...n.data,orders:metrics.orders,onTimeRate:metrics.onTimeRate}}:n));
 }).catch(e=>{if(idx===detailRequest.current)setDetail({...emptyDetail,error:e instanceof Error?e.message:'Analyse nicht verfügbar'});});
 return()=>{detailRequest.current++};
 },[selectedId,globals,locals,loaded]);
 const split=async(id:string,field:FieldKey)=>{const f=effective(id);const rows=await analysisApi.breakdown(field,f);if(!rows.length)throw Error('Keine Teilgruppen für diese Filter verfügbar');
  remember();const next=splitGraph(nodes,edges,id,field,rows);setNodes(next.nodes);setEdges(next.edges);say(rows.length+' Teilgruppen geladen');};
 const pageSearch=(term:string)=>{setSearch(term);if(term.trim().length<2)return;const item=nodes.find(n=>n.data.analysis.label.toLowerCase().includes(term.toLowerCase()));if(item){setSelectedId(item.id);setView('analytics');void flow.fitView({nodes:[{id:item.id}],duration:250,padding:.6});}};
 const modeActions={nodes,edges,onNodesChange:onNodeChanges,onEdgesChange:onEdgeChanges,onConnect:connect,onSelect:setSelectedId,onSelectionClear:()=>{},selectedId,editMode,onEditToggle:()=>setEditMode(v=>!v),onFilter:(id:string)=>setDialog({kind:'node',id}),onSplit:(id:string)=>setDialog({kind:'split',id}),onRemove:removeNode,onAdd:addNode,onSave:saveDraft,onReset:resetDraft,onGraphMove:()=>{setDirty(true);},onGraphStart:remember,onUndo:undo,onRedo:redo,onViewportChange:(v:Viewport)=>{viewportRef.current=v;},fullscreen,setFullscreen,canEdit:isEditing(role),dirty,onHelp:()=>say('Dashboard-Komponenten werden mit Phase 4 im Dashboard Builder aktiv. Knoten, Notizen und Filter sind bereits verwendbar.')};
 return <div className={'app-shell '+(collapsed?'sidebar-collapsed':'')}><Header userEmail={email} onSignOut={onSignOut} onProfile={()=>handleSetView('profile')} onSearch={pageSearch} onHelp={()=>setHelp(true)}/>
  <Sidebar view={view} onNavigate={handleSetView} collapsed={collapsed} setCollapsed={setCollapsed} role={role}/>
  <main className="app-main">
   {(['analytics','tree','builder','home'] as View[]).includes(view)?<>
    <div className="page-title-row"><div className="page-heading"><Icon name="chart-column" size={28}/><div><h1>{view==='tree'?'Decision Tree':view==='builder'?'Dashboard Builder':view==='home'?'Willkommen bei NXT Analytics':'KPI-Analyse'}</h1><p>Interaktive Ursachenanalyse mit Decision Tree · {PROJECT.years}</p></div></div><div className="top-actions"><Button icon="save" onClick={saveDraft} disabled={!isEditing(role)}>Speichern</Button><Button icon="share-2" onClick={share}>Teilen</Button><Button kind="primary" icon="play" onClick={triggerReload} disabled={busy}>Analyse ausführen</Button></div></div>
    {warning&&<Notice kind="warning">{warning}</Notice>}
    <MetricRibbon ribbon={ribbon} trend={ribbonTrend} pending={busy}/>
    <FilterStrip globals={globals} onRemove={removeGlobal} onAdd={()=>setDialog({kind:'global'})} onReset={()=>setGlobals([])} onShare={share}/>
    <div className={'workspace-row '+(!rightVisible?'no-detail':'')}><CanvasWithFlow {...modeActions}/>{rightVisible&&<DetailPanel node={selectedNode} detail={detail} tab={selectedTab} setTab={setSelectedTab} onClose={()=>setRightVisible(false)} onFilter={()=>setDialog({kind:'node',id:selectedId})}/>}</div>
    {!rightVisible&&<button className="detail-reopen" onClick={()=>setRightVisible(true)}><Icon name="layers" size={17}/> Detaildashboard einblenden</button>}
    <div className="bottom-disclaimer">Analyse-Ansicht · Datenbasis WoodCorp {PROJECT.years} · Das Referenzdesign enthält illustrative, nicht übernommene Beispielwerte. {isEditing(role)?'Editor speichert in dieser Phase lokal im Browser.':''}</div>
   </>:view==='data'?<DataPage/>:view==='filters'?<FilterLibrary dimensions={dimensions} admin={role==='admin'}/>:view==='team'?<TeamPanel role={role}/>:<ProfilePage email={email} role={role}/>}
  </main>
  {dialog&&dialog.kind!=='split'&&<FilterDialog target={{kind:dialog.kind==='global'?'global':'node',id:dialog.id}} dimensions={dimensions} onApply={applyFilter} onClose={()=>setDialog(null)}/>}
  {dialog?.kind==='split'&&<SplitDialog nodeName={nodes.find(n=>n.id===dialog.id)?.data.analysis.label||'Knoten'} dimensions={dimensions} onSplit={field=>split(dialog.id!,field)} onClose={()=>setDialog(null)}/>}
  {help&&<Modal title="NXT Analytics – Bedienung" onClose={()=>setHelp(false)}><div className="help-copy"><p><b>Analysieren:</b> Knoten auswählen, global filtern und im rechten Dashboard die Detaildaten ansehen.</p><p><b>Bearbeiten:</b> Im Bearbeitungsmodus Knoten frei verschieben, Notizen aus der Palette ziehen und Verbindungspunkte mit der Maus verbinden. Neu gezogene Linien sind zunächst visuelle Referenzen, keine Filterverknüpfung.</p><p><b>Split:</b> Über die Knoten-Aktion eine Dimension auswählen; die resultierenden Teilgruppen sind analytisch mit ihrem Elternknoten verbunden.</p><p><b>Speichern:</b> In diesem Entwicklungsstand nur lokal auf dem aktuellen Gerät. Die gemeinsame Supabase-Speicherung folgt in Phase 5.</p></div></Modal>}
  {!!toast&&<div className="nxt-toast" role="status">{toast}<button aria-label="Meldung schließen" onClick={()=>setToast('')}>×</button></div>}
 </div>;
}
export default function App(){const [state,setState]=useState<'loading'|'login'|'app'|'no-access'>('loading');const [authMode,setAuthMode]=useState<'login'|'invite'|'recovery'>('login');const [role,setRole]=useState<Role|null>(null);const [email,setEmail]=useState('');const [userId,setUserId]=useState('');
 const refreshAuth=useCallback(async()=>{const {data,error}=await supabase.auth.getUser();if(error||!data.user){setState('login');setAuthMode('login');return;}setEmail(data.user.email||'');setUserId(data.user.id);
 const membership=await supabase.from('woodcorp_access').select('role').eq('user_id',data.user.id).maybeSingle();if(!membership.data?.role){setState('no-access');return;}
 setRole(membership.data.role as Role);
 const params=new URLSearchParams(location.search);if(params.has('invite')){setAuthMode('invite');setState('login');}else if(params.has('recovery')){setAuthMode('recovery');setState('login');}else setState('app');},[]);
 useEffect(()=>{void refreshAuth();const {data}=supabase.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){setState('login');setAuthMode('login');}else if(event==='SIGNED_IN'){setTimeout(()=>void refreshAuth(),0)}});return()=>data.subscription.unsubscribe();},[refreshAuth]);
 const signout=async()=>{await supabase.auth.signOut();setState('login')};
 if(state==='loading')return <div className="boot-screen"><Spinner text="NXT Analytics wird vorbereitet …"/></div>;
 if(state==='login')return <AuthScreen client={supabase} mode={authMode} onDone={()=>void refreshAuth()}/>;
 if(state==='no-access')return <div className="access-denied"><Brand/><h1>Für dieses Projekt ist eine Freigabe erforderlich.</h1><p>Du bist angemeldet, aber noch nicht für NXT Analytics berechtigt. Bitte wende dich an die Administration.</p><Button icon="log-out" onClick={signout}>Abmelden</Button></div>;
 return <ReactFlowProvider><AnalyticsWorkspace userId={userId} role={role!} email={email} onSignOut={signout}/></ReactFlowProvider>;
}