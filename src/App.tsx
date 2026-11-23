import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ReactFlowProvider,useEdgesState,useNodesState,useReactFlow,type Connection,type EdgeChange,type NodeChange,type Viewport} from '@xyflow/react';
import {FIELD_LABELS,FIELDS,PROJECT,FILTER_KIND,OTIF_STATUS_LABELS,type FieldKey} from './config';
import {analysisApi,memberApi,supabase,clearAnalyticsCache} from './lib/supabase';
import {effectiveFilters,labels,makeFilter,toBackend,validateFilters,formatFilter,traceFilters} from './core/filters';
import {ROOT_ID,rootAnalysis,createInitialGraph,createBlankWorkspaceGraph,splitGraph,nodeFor,referenceEdge,isValidReference,cleanDraft,serializeDraft,restoreDraft,type NNode,type NEdge} from './core/graph';
import type {Filter,Role,Ribbon,Metrics,TrendRow,BreakdownRow,PaletteType,DashboardData,SavedDraft,AnalysisNode} from './core/types';
import {CanvasWithFlow} from './components/GraphCanvas';
import Icon from './components/Icon';
import {Brand,Button,IconButton,Modal,Notice,Spinner,number,percent,decimal,SmallTrend} from './components/Ui';
import AuthScreen from './components/AuthScreen';
import {DashboardRenderer,DashboardBuilder} from './components/DashboardBuilder';
import {WorkspaceControls,FilterCatalogPage} from './components/WorkspaceControls';
import {standardDashboard,makeDocument,validDocument,metricValue,metricFormat,METRIC_LABELS,type MetricKey,type NodeDashboard} from './core/dashboard';
import {CalculationLogic} from './components/CalculationLogic';
import {workspacesApi,type WorkspaceRecord,type FilterCatalogRow} from './lib/workspaces';
import './styles/dashboard.css';
import './styles/v4.css';
import './styles/v5.css';
import './styles/v6.css';
import {NodeSettings} from './components/NodeSettings';
import {conflictingFields,filterSignature} from './core/filters';
import {WorkspaceOverview} from './components/WorkspaceOverview';
import {DataExplorer} from './components/DataExplorer';
import {FilterCatalogV4} from './components/FilterCatalogV4';
import {DashboardFullView,KpiNameDialog,RenameNodeDialog,type MetricNames} from './components/DashboardViews';
import type {FilterCandidate} from './lib/workspaces';

type View='home'|'workspaces'|'analytics'|'tree'|'builder'|'data'|'filters'|'team'|'profile';
const NAV:{id:View;label:string;icon:string;admin?:boolean}[]=[
 {id:'home',label:'Home',icon:'house'}, {id:'workspaces',label:'Workspaces',icon:'layers'}, {id:'analytics',label:'KPI-Analyse',icon:'chart-column'},
 {id:'tree',label:'Decision Tree',icon:'network'}, {id:'builder',label:'Dashboard Builder',icon:'layout-dashboard'},
 {id:'data',label:'Datenquellen',icon:'database'}, {id:'filters',label:'Filterbibliothek',icon:'filter'},
 {id:'team',label:'Team & Zugänge',icon:'user-round',admin:true},{id:'profile',label:'Konfiguration',icon:'settings'}
];
const emptyDetail:DashboardData={metrics:null,trend:[],breakdown:[],pending:false,error:null};
const fmtDate=(value:string|null|undefined)=>value?new Date(value).toLocaleDateString('de-DE'):'–';
const isEditing=(role:Role|null)=>role==='admin'||role==='analyst';

function FilterDialog({target,dimensions,allowedFields,fieldNames,onApply,onClose}:{target:{kind:'global'|'node';id?:string};dimensions:Record<string,string[]>;allowedFields:FieldKey[];fieldNames:Record<FieldKey,string>;onApply:(f:Filter)=>void;onClose:()=>void}){
 const [field,setField]=useState<FieldKey>(allowedFields[0]||'factory');
 const kind=FILTER_KIND(field), options=dimensions[field]||[];
 const [op,setOp]=useState<Filter['op']>('eq'),[value,setValue]=useState(''),[multi,setMulti]=useState<string[]>([]);
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[error,setError]=useState('');
 useEffect(()=>{setOp(FILTER_KIND(field)==='category'?'eq':'between');setValue((dimensions[field]||[])[0]||'');setMulti([]);setFrom('');setTo('');setError('');},[field,dimensions]);
 const categorical=kind==='category', numeric=kind==='number';
 const submit=(e:React.FormEvent)=>{
  e.preventDefault();setError('');
  try{
   const payload:string|string[]=categorical?(op==='in'?multi:value):op==='between'?[from,to]:from;
   onApply(makeFilter(field,payload,target.kind==='global'?'global':'local',op));onClose();
  }catch(err){setError(err instanceof Error?err.message:'Ungültiger Filter');}
 };
 return <Modal title={target.kind==='global'?'Globalen Filter hinzufügen':'Lokalen Filter für den Knoten'} onClose={onClose}>
  <p className="muted">{target.kind==='global'?'Dieser Filter gilt für alle Knoten, Diagramme und Dashboards.':'Der Filter gilt für diesen Knoten und alle über Pfeile erreichbaren Nachfolger, nicht für unabhängige Zweige.'}</p>
  <form onSubmit={submit} className="nxt-typed-filter">
   <label className="field">Dimension<select value={field} onChange={e=>setField(e.target.value as FieldKey)}>{allowedFields.map(f=><option key={f} value={f}>{fieldNames[f]}</option>)}</select></label>
   <label className="field">Vergleich<select value={op} onChange={e=>{setOp(e.target.value as Filter['op']);setError('')}}>{categorical?<><option value="eq">Ist gleich</option><option value="in">Ist einer von (Mehrfachauswahl)</option></>:<><option value="between">Zwischen / Zeitraum</option><option value="gte">Ab (≥)</option><option value="lte">Bis (≤)</option><option value="eq">Gleich (=)</option></>}</select></label>
   {categorical&&(op==='eq'?<label className="field">Wert<select value={value} onChange={e=>setValue(e.target.value)}><option value="">Bitte wählen</option>{options.map(v=><option value={v} key={v}>{OTIF_STATUS_LABELS[v]||v}</option>)}</select></label>:
    <fieldset className="nxt-multiselect"><legend>Mehrere Werte auswählen (max. 20)</legend>{options.map(v=><label key={v}><input type="checkbox" checked={multi.includes(v)} onChange={e=>setMulti(old=>e.target.checked?[...old,v].slice(0,20):old.filter(x=>x!==v))}/>{OTIF_STATUS_LABELS[v]||v}</label>)}</fieldset>)}
   {!categorical&&<div className="nxt-filter-range">
    <label className="field">{op==='between'?'Von':op==='gte'?'Ab':op==='lte'?'Bis':'Wert'}<input type={numeric?'number':'date'} step={numeric?'any':undefined} required value={from} onChange={e=>setFrom(e.target.value)}/></label>
    {op==='between'&&<label className="field">Bis<input type={numeric?'number':'date'} step={numeric?'any':undefined} required value={to} onChange={e=>setTo(e.target.value)}/></label>}
   </div>}
   {error&&<Notice kind="error">{error}</Notice>}
   <div className="modal-actions"><Button onClick={onClose}>Abbrechen</Button><Button kind="primary" icon="check" type="submit">Filter anwenden</Button></div>
  </form>
 </Modal>;
}
function SplitDialog({nodeName,dimensions,allowedFields,fieldNames,onSplit,onClose}:{nodeName:string;dimensions:Record<string,string[]>;allowedFields:FieldKey[];fieldNames:Record<FieldKey,string>;onSplit:(f:FieldKey)=>Promise<void>;onClose:()=>void}){
 const [field,setField]=useState<FieldKey>('product_type');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 return <Modal title="Knoten aufgliedern" onClose={onClose}><p className="muted"><b>{nodeName}</b> wird nach einer zugelassenen Dimension in analytische Teilgruppen zerlegt. Diese Teilgruppen erben automatisch die Knotenfilter.</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await onSplit(field);onClose();}catch(e){setError(e instanceof Error?e.message:'Aufgliederung nicht möglich');}finally{setBusy(false)}}}>
  <label className="field">Split-Dimension<select value={field} onChange={e=>setField(e.target.value as FieldKey)}>{allowedFields.filter(f=>dimensions[f]?.length).map(f=><option key={f} value={f}>{fieldNames[f]}</option>)}</select></label>
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
 </nav><div className="nav-spacer"/><div className="nav-bottom">{!collapsed&&<><div className="nav-label"><Icon name="star" size={16}/> FAVORITEN</div><button type="button" onClick={()=>onNavigate('analytics')}><Icon name="target" size={16}/> On-Time Delivery</button><p>WoodCorp · O2C</p></>}<div className="nav-dots" aria-hidden="true"/></div></aside>;}
function MetricRibbon({ribbon,trend,pending,names,onExplain}:{ribbon:Ribbon|null;trend:TrendRow[];pending:boolean;names:MetricNames;onExplain:(metric:MetricKey)=>void}){
 const graph=trend.filter(r=>r.on_time_rate!=null).map(r=>Number(r.on_time_rate));
 const cards:{key:MetricKey;icon:string;hint:string;highlight?:boolean;graph?:number[]}[]=[
  {key:'otifRate',icon:'target',hint:'On Time In Full · Ziel 80 %',highlight:true},
  {key:'onTimeRate',icon:'clock-3',hint:'Pünktliche Lieferungen',graph},
  {key:'volumeConformanceRate',icon:'check-circle-2',hint:'Mengenkonforme Lieferungen'},
  {key:'totalPenaltyEur',icon:'triangle-alert',hint:'Vertragsstrafenmodell · 0,75 €/kg'},
  {key:'orders',icon:'package',hint:'Case-basierte Aufträge'}
 ];
 return <div className="kpi-ribbon">{cards.map(card=><section className={'ribbon-card '+(card.highlight?'featured':'')} key={card.key}>
   <div className="ribbon-symbol"><Icon name={card.icon} size={23}/></div>
   <div className="ribbon-content"><h3>{names[card.key]||METRIC_LABELS[card.key]}</h3><div className="ribbon-value">{pending&&!ribbon?'…':metricFormat(card.key,ribbon?metricValue(card.key,ribbon,ribbon):null)}</div><small>{card.hint}</small></div>
   {card.graph&&<SmallTrend values={card.graph}/>}
   <button className="ribbon-explain" type="button" onClick={()=>onExplain(card.key)} aria-label={'Berechnungslogik für '+METRIC_LABELS[card.key]} title="Berechnungslogik öffnen"><Icon name="info" size={15}/></button>
 </section>)}</div>;
}
function FilterStrip({globals,fieldNames,onRemove,onAdd,onReset,onShare}:{globals:Filter[];fieldNames:Record<FieldKey,string>;onRemove:(id:string)=>void;onAdd:()=>void;onReset:()=>void;onShare:()=>void}){
 return <div className="filter-strip"><div className="filter-title"><Icon name="filter" size={17}/> Aktive Filter <b>({globals.length})</b></div><div className="filter-chips">{globals.map(f=><div className="filter-chip" key={f.id}><span><b>{formatFilter(f,fieldNames)}</b></span><button title="Filter entfernen" aria-label={'Filter '+formatFilter(f,fieldNames)+' entfernen'} onClick={()=>onRemove(f.id)}>×</button></div>)}{!globals.length&&<span className="no-filters">Alle Werke · alle historischen Lieferungen</span>}</div>
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
function DetailPanel({node,detail,tab,setTab,onClose,onFilter,onExpand,onRename,dashboard,filters,fieldNames,filterTrace,onExplain,onEdit,canEdit}:{node:NNode|undefined;detail:DashboardData;tab:string;setTab:(v:string)=>void;onClose:()=>void;onFilter:()=>void;onExpand:()=>void;onRename:()=>void;dashboard:NodeDashboard;filters:Filter[];fieldNames:Record<FieldKey,string>;filterTrace:ReturnType<typeof traceFilters>;onExplain:(metric:MetricKey)=>void;onEdit:()=>void;canEdit:boolean}){
 if(!node)return <section className="detail-panel"><div className="detail-header"><strong>Knoten-Dashboard</strong></div><div className="chart-empty">Knoten im Analysebaum auswählen.</div></section>;
 const m=detail.metrics;const late=detail.ribbon?.lateOrders;const viz=node.data.analysis.visualization;const explanatoryMetric=(viz==='bar'||viz==='line'?'onTimeRate':viz==='donut'?(node.data.analysis.metricId||'otifRate'):node.data.analysis.metricId==='otd'?'onTimeRate':node.data.analysis.metricId||'otifRate') as MetricKey;const tabs=['Übersicht','Details','Treiber','Vergleich','Berechnungslogik'];
 return <aside className="detail-panel"><div className="detail-header"><div><Icon name="layers" size={20}/><div><strong>Knoten-Dashboard: {node.data.analysis.label}</strong><small>{node.data.analysis.predicate?fieldNames[node.data.analysis.predicate.field]:'Kennzahl'} · WoodCorp O2C</small></div></div><div className="detail-head-actions">{canEdit&&<IconButton name="type" title="Knoten umbenennen" onClick={onRename}/>}<IconButton name="maximize" title="Dashboard als Vollbild öffnen" onClick={onExpand}/><IconButton name="x" title="Detailbereich schließen" onClick={onClose}/></div></div>
 <nav className="detail-tabs" aria-label="Dashboard-Ansichten">{tabs.map(t=><button key={t} className={t===tab?'selected':''} aria-current={t===tab?'page':undefined} onClick={()=>setTab(t)}>{t}</button>)}</nav>
 {detail.pending&&!m?<Spinner text="Knotenkennzahlen werden geladen …"/>:detail.error?<Notice kind="error">{detail.error}</Notice>:<div className="detail-body">
 {tab==='Übersicht'&&<><div className="detail-dashboard-edit"><span className="muted">Knotenbezogenes Dashboard · {dashboard.widgets.length} Elemente</span>{canEdit&&<button className="nxt-button secondary" onClick={onEdit}><Icon name="layout-dashboard" size={16}/> Dashboard bearbeiten</button>}</div><DashboardRenderer dashboard={dashboard} detail={detail} filters={filters} compact onExplain={onExplain}/></>}
 {tab==='Berechnungslogik'&&<CalculationLogic metric={explanatoryMetric} metrics={m} trace={filterTrace} fieldNames={fieldNames} node={node.data.analysis} calculated={node.data.calculation} compact/>}
  {tab==='Details'&&<div className="chart-box"><h3>Kennzahlen und Datenumfang</h3><dl className="detail-list"><dt>Aufträge</dt><dd>{number(m?.orders)}</dd><dt>OTIF</dt><dd>{percent(m?.otifRate)}</dd><dt>OTIF-Aufträge</dt><dd>{number(m?.otifCases)}</dd><dt>Modellierte Vertragsstrafe (0,75 €/kg)</dt><dd>{metricFormat('totalPenaltyEur',m?.totalPenaltyEur??null)}</dd><dt>Pünktlich, aber nicht mengenkonform</dt><dd>{number(m?.onTimeNotFullCases)}</dd><dt>Verspätet, aber mengenkonform</dt><dd>{number(m?.lateInFullCases)}</dd><dt>Verspätet und nicht mengenkonform</dt><dd>{number(m?.lateNotFullCases)}</dd><dt>Pünktliche Lieferungen</dt><dd>{percent(m?.onTimeRate)}</dd><dt>Mengentreue</dt><dd>{percent(m?.volumeConformanceRate)}</dd><dt>Vollständige Liefertermine</dt><dd>{number(m?.dateCoverage)}</dd><dt>Früheste Lieferung</dt><dd>{fmtDate(m?.firstDelivery)}</dd><dt>Späteste Lieferung</dt><dd>{fmtDate(m?.lastDelivery)}</dd></dl></div>}
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
}function ProfilePage({email,role}:{email:string;role:Role|null}){const [pw,setPw]=useState('');const [notice,setNotice]=useState('');const submit=async(e:React.FormEvent)=>{e.preventDefault();if(pw.length<12){setNotice('Mindestens 12 Zeichen erforderlich');return;}const {error}=await supabase.auth.updateUser({password:pw});setNotice(error?error.message:'Passwort geändert');if(!error)setPw('')};return <section className="content-page"><h2>Konfiguration</h2><div className="standard-card profile"><h3>Mein Profil</h3><p><b>Adresse:</b> {email}</p><p><b>Rolle:</b> {role}</p><form onSubmit={submit}><label className="field">Neues Passwort<input type="password" minLength={12} autoComplete="new-password" value={pw} onChange={e=>setPw(e.target.value)} required/></label><Button kind="primary" type="submit" icon="lock">Passwort ändern</Button></form>{notice&&<Notice>{notice}</Notice>}</div></section>}

function AnalyticsWorkspace({userId,role,email,onSignOut}:{userId:string;role:Role;email:string;onSignOut:()=>void}){
 const flow=useReactFlow<NNode,NEdge>();const [view,setView]=useState<View>('analytics');const [collapsed,setCollapsed]=useState(false);
 const [globals,setGlobals]=useState<Filter[]>([]);const [locals,setLocals]=useState<Record<string,Filter[]>>({});
 const [dimensions,setDimensions]=useState<Record<string,string[]>>({});const [ribbon,setRibbon]=useState<Ribbon|null>(null);const [rootMetrics,setRootMetrics]=useState<Metrics|null>(null);const [ribbonTrend,setRibbonTrend]=useState<TrendRow[]>([]);
 const [selectedId,setSelectedId]=useState(ROOT_ID);const [selectedTab,setSelectedTab]=useState('Übersicht');const [logicContext,setLogicContext]=useState<{metric:MetricKey;nodeId:string|null}|null>(null);const [detail,setDetail]=useState<DashboardData>(emptyDetail);
 const [nodes,setNodes,onNodesChange]=useNodesState<NNode>([nodeFor(rootAnalysis(),{x:500,y:70})]);
 const [dashboards,setDashboards]=useState<Record<string,NodeDashboard>>({});const [metricNames,setMetricNames]=useState<MetricNames>({});const [fullDashboard,setFullDashboard]=useState(false);const [nameDialog,setNameDialog]=useState<'node'|'metrics'|null>(null);const defaultDashboardRef=useRef<Record<string,NodeDashboard>>({});
 const [workspaces,setWorkspaces]=useState<WorkspaceRecord[]>([]);const [activeWorkspace,setActiveWorkspace]=useState<WorkspaceRecord|null>(null);
 const [catalog,setCatalog]=useState<FilterCatalogRow[]>([]);const [candidates,setCandidates]=useState<FilterCandidate[]>([]);const [saving,setSaving]=useState(false);const [catalogBusy,setCatalogBusy]=useState(false);
 const [edges,setEdges,onEdgesChange]=useEdgesState<NEdge>([]);const [editMode,setEditMode]=useState(false);const [rightVisible,setRightVisible]=useState(true);const [fullscreen,setFullscreen]=useState(false);const [busy,setBusy]=useState(true);const [warning,setWarning]=useState('');const [toast,setToast]=useState('');
 const [dialog,setDialog]=useState<{kind:'global'|'node'|'split';id?:string}|null>(null);const [configureNodeId,setConfigureNodeId]=useState<string|null>(null);const [help,setHelp]=useState(false);const [search,setSearch]=useState('');const [dirty,setDirty]=useState(false);const [loaded,setLoaded]=useState(false);const [reloadKey,setReloadKey]=useState(0);
 const viewportRef=useRef<Viewport>({x:0,y:0,zoom:1});const requestRef=useRef(0);const detailRequest=useRef(0);const graphRequest=useRef(0);const undoRef=useRef<Array<{nodes:NNode[];edges:NEdge[]}>>([]);const redoRef=useRef<Array<{nodes:NNode[];edges:NEdge[]}>>([]);const initializedRef=useRef(false);
 const localKey='nxt-v2-layout:'+userId;
 const say=useCallback((s:string)=>{setToast(s);},[]);
 const canModify=isEditing(role)&&(!activeWorkspace||activeWorkspace.owner_id===userId||role==='admin');
 useEffect(()=>{if(!canModify)setEditMode(false)},[canModify]);
 const allowedFields=useMemo(()=>catalog.length?catalog.filter(c=>c.enabled).map(c=>c.field_key):FIELDS,[catalog]);
 const fieldNames=useMemo(()=>({...FIELD_LABELS,...Object.fromEntries(catalog.map(c=>[c.field_key,c.display_name]))}) as Record<FieldKey,string>,[catalog]);
 const currentDashboard=useMemo(()=>dashboards[selectedId]||(defaultDashboardRef.current[selectedId]??=standardDashboard()),[dashboards,selectedId]);
 const updateDashboard=(next:NodeDashboard)=>{if(!canModify)return;setDashboards(old=>({...old,[selectedId]:next}));setDirty(true);};
 const reloadWorkspaces=useCallback(async()=>{try{setWorkspaces(await workspacesApi.list())}catch(e){say(e instanceof Error?e.message:'Workspace-Abfrage fehlgeschlagen')}},[say]);
 const reloadCatalog=useCallback(async()=>{try{setCatalog(await workspacesApi.catalog())}catch(e){say(e instanceof Error?e.message:'Filterkatalog nicht verfügbar')}},[say]);
 const reloadCandidates=useCallback(async()=>{try{setCandidates(await workspacesApi.candidates())}catch(e){say(e instanceof Error?e.message:'Filterkandidaten nicht verfügbar')}},[say]);
 useEffect(()=>{void reloadWorkspaces();void reloadCatalog();void reloadCandidates()},[userId,reloadWorkspaces,reloadCatalog,reloadCandidates]);
 useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),4200);return()=>clearTimeout(t)}},[toast]);
 const handleSetView=(next:View)=>{setView(next);if(next==='builder')setEditMode(canModify);if(next==='tree'||next==='analytics')setRightVisible(true)};
 const graphFilterKey=JSON.stringify({nodes:nodes.map(n=>n.data.analysis),edges:edges.map(e=>({source:e.source,target:e.target}))});
 const topology=useMemo(()=>JSON.parse(graphFilterKey) as {nodes:AnalysisNode[];edges:Array<{source:string;target:string}>},[graphFilterKey]);
 const analysisNodes=topology.nodes;
 const selectedNode=nodes.find(n=>n.id===selectedId);
 const effective=useCallback((id=selectedId)=>effectiveFilters(globals,analysisNodes,locals,id,topology.edges),[globals,analysisNodes,locals,selectedId,topology.edges]);
 const snapshot=useCallback(()=>({nodes:structuredClone(nodes),edges:structuredClone(edges)}),[nodes,edges]);
 const remember=useCallback(()=>{undoRef.current=[...undoRef.current.slice(-29),snapshot()];redoRef.current=[];setDirty(true)},[snapshot]);
 const undo=useCallback(()=>{const prev=undoRef.current.pop();if(!prev)return;redoRef.current.push(snapshot());setNodes(prev.nodes);setEdges(prev.edges);setDirty(true)},[setNodes,setEdges,snapshot]);
 const redo=useCallback(()=>{const prev=redoRef.current.pop();if(!prev)return;undoRef.current.push(snapshot());setNodes(prev.nodes);setEdges(prev.edges);setDirty(true)},[setNodes,setEdges,snapshot]);
 const onNodeChanges=useCallback((changes:NodeChange<NNode>[])=>{if(editMode&&!canModify)return;onNodesChange(changes);if(editMode&&canModify&&changes.some(c=>c.type==='position'))setDirty(true)},[onNodesChange,editMode,canModify]);
 const onEdgeChanges=useCallback((changes:EdgeChange<NEdge>[])=>{if(!editMode||!canModify)return;onEdgesChange(changes);setDirty(true)},[onEdgesChange,editMode,canModify]);
 const connect=useCallback((c:Connection)=>{if(!editMode||!canModify||!c.source||!c.target)return;if(!isValidReference(c.source,c.target,edges,nodes)){say('Verbindung ungültig, bereits vorhanden oder führt zu einem Filterkreis.');return;}
  remember();setEdges(e=>[...e,referenceEdge(c.source!,c.target!)]);say('Filterfluss verbunden: Alle Filter des Ursprungsknotens gelten nun auch im Ziel und dessen Nachfolgern.');},[edges,nodes,editMode,canModify,remember,setEdges,say]);
 const buildDocument=()=>makeDocument(serializeDraft(nodes,edges,locals,viewportRef.current),globals,dashboards,metricNames);
 const createWorkspace=async(title:string):Promise<boolean>=>{
  if(!isEditing(role))return false;
  if(dirty&&!confirm('Aktuelle Änderungen sind noch nicht gespeichert. Wirklich einen neuen, leeren Workspace öffnen?'))return false;
  setSaving(true);
  try{
   const base=createBlankWorkspaceGraph();
   const viewport={x:0,y:0,zoom:1};
   const document=makeDocument(serializeDraft(base.nodes,base.edges,{},viewport),[],{},{});
   const ws=await workspacesApi.create(userId,document,title);
   setNodes(base.nodes);setEdges([]);setGlobals([]);setLocals({});
   setDashboards({});setMetricNames({});defaultDashboardRef.current={};
   setSelectedId(base.nodes[0].id);setSelectedTab('Übersicht');
   viewportRef.current=viewport;
   setActiveWorkspace(ws);setWorkspaces(prev=>[ws,...prev]);
   localStorage.setItem(localKey,JSON.stringify(document.graph));
   initializedRef.current=true;setLoaded(true);setDirty(false);
   window.setTimeout(()=>void flow.fitView({duration:280,padding:.45}),80);
   say('Neuer privater Workspace: ein unkonfigurierter Ausgangsknoten, keine Unterpunkte.');
   return true;
  }catch(e){say(e instanceof Error?e.message:'Workspace konnte nicht erstellt werden');return false;}
  finally{setSaving(false)}
 };
 const saveDraft=async()=>{if(!canModify){say('Keine Berechtigung zum Speichern dieses Workspaces');return;}setSaving(true);
  try{const document=buildDocument();localStorage.setItem(localKey,JSON.stringify(document.graph));
   if(!activeWorkspace){const ws=await workspacesApi.create(userId,document,'Meine Analyse');setActiveWorkspace(ws);setWorkspaces(prev=>[ws,...prev]);}
   else{const saved=await workspacesApi.save(activeWorkspace,document);setActiveWorkspace(saved);setWorkspaces(prev=>prev.map(w=>w.id===saved.id?saved:w));}
   setDirty(false);say('Workspace mit allen Knoten und Dashboards in Supabase gespeichert');
  }catch(e){say(e instanceof Error?e.message:'Speichern fehlgeschlagen')}finally{setSaving(false)};
 };
 const selectWorkspace=async(id:string)=>{
  if(dirty&&!confirm('Es gibt ungespeicherte Änderungen. Workspace trotzdem wechseln?'))return false;
  if(id==='local'){setActiveWorkspace(null);setDashboards({});setMetricNames({});defaultDashboardRef.current={};setDirty(false);say('Lokale Kopie aktiviert; bisherige Ansicht bleibt erhalten');return true;}
  const ws=workspaces.find(w=>w.id===id);if(!ws)return false;
  const data=validDocument(ws.document);if(!data){say('Gespeicherte Workspace-Daten sind ungültig');return false;}
  try{const graph=restoreDraft(data.graph);setNodes(graph.nodes);setEdges(graph.edges);setGlobals(validateFilters(data.globalFilters));setLocals(data.graph.localFilters||{});setDashboards(data.dashboards);setMetricNames(data.metricNames||{});setSelectedId(graph.nodes.find(n=>n.id===ROOT_ID)?.id||graph.nodes[0]?.id||ROOT_ID);setActiveWorkspace(ws);setDirty(false);initializedRef.current=true;setLoaded(true);viewportRef.current=data.graph.viewport;
   window.setTimeout(()=>void flow.setViewport(data.graph.viewport,{duration:280}),100);say('Workspace geladen: '+ws.title);return true;
  }catch(e){say(e instanceof Error?e.message:'Laden fehlgeschlagen');return false}
 };
 const toggleShare=async()=>{if(!activeWorkspace||!canModify)return;
  if(dirty){say('Bitte zuerst Änderungen speichern, bevor du den Workspace freigibst.');return;}  const publishing=activeWorkspace.status!=='published'||activeWorkspace.visibility!=='team';
  if(publishing&&!confirm('Diesen Workspace für alle Mitglieder des NXT Analytics-Projekts sichtbar machen?'))return;
  setSaving(true);try{const saved=await workspacesApi.updateMetadata(activeWorkspace,publishing?{status:'published',visibility:'team'}:{status:'draft',visibility:'private'});setActiveWorkspace(saved);setWorkspaces(prev=>prev.map(w=>w.id===saved.id?saved:w));say(publishing?'Workspace für das Team veröffentlicht':'Workspace wieder privat gestellt');}catch(e){say(e instanceof Error?e.message:'Freigabe fehlgeschlagen')}finally{setSaving(false)}
 };
 const deleteWorkspace=async(id:string):Promise<void>=>{
  const ws=workspaces.find(x=>x.id===id);
  if(!ws||!(isEditing(role)&&(ws.owner_id===userId||role==='admin')))throw Error('Keine Löschberechtigung.');
  setSaving(true);
  try{
   await workspacesApi.remove(id,ws.revision);
   setWorkspaces(prev=>prev.filter(w=>w.id!==id));
   if(activeWorkspace?.id===id){
    const base=createBlankWorkspaceGraph();
    setActiveWorkspace(null);setNodes(base.nodes);setEdges([]);setGlobals([]);
    setLocals({});setDashboards({});setMetricNames({});defaultDashboardRef.current={};
    setSelectedId(base.nodes[0].id);setDirty(false);setLoaded(true);
    localStorage.removeItem(localKey);
   }
   say('Workspace "'+ws.title+'" wurde gelöscht. WoodCorp-Daten bleiben erhalten.');
  }finally{setSaving(false)}
 };
 const removeWorkspace=async()=>{
  if(!activeWorkspace||!canModify)return;
  if(!confirm('Workspace "'+activeWorkspace.title+'" unwiderruflich löschen?'))return;
  try{await deleteWorkspace(activeWorkspace.id)}catch(e){say(e instanceof Error?e.message:'Löschen fehlgeschlagen')}
 };
 const toggleCatalog=async(field:FieldKey,enabled:boolean)=>{
  if(role!=='admin')return;
  try{const saved=await workspacesApi.updateCatalog(field,enabled);setCatalog(rows=>rows.map(r=>r.field_key===field?saved:r));say('Filterfreigabe aktualisiert');}catch(e){say(e instanceof Error?e.message:'Änderung nicht gespeichert')}
 };
 const addCatalogField=async(field:FieldKey,name:string)=>{
  if(role!=='admin')throw Error('Administratorrechte erforderlich');
  setCatalogBusy(true);try{
   await workspacesApi.registerFilter(field,name);
   await Promise.all([reloadCatalog(),reloadCandidates()]);
   say('Filter validiert und zur Bibliothek hinzugefügt: '+name);
  }finally{setCatalogBusy(false)}
 };
 const renameCatalogField=async(field:FieldKey,name:string)=>{
  if(role!=='admin')throw Error('Administratorrechte erforderlich');
  setCatalogBusy(true);try{
   await workspacesApi.renameFilter(field,name);
   await reloadCatalog();say('Filterbezeichnung geändert: '+name);
  }finally{setCatalogBusy(false)}
 };
 const renameSelectedNode=(name:string)=>{
  if(!canModify)return;
  if(name.trim().length<2||name.trim().length>100){say('Name muss 2–100 Zeichen umfassen.');return;}
  remember();
  setNodes(prev=>prev.map(n=>n.id===selectedId?{...n,data:{...n.data,analysis:{...n.data.analysis,label:name.trim()}}}:n));
  setDirty(true);say('Knoten umbenannt. Änderungen im Workspace speichern.');
 };
 const resetCamera=()=>{void flow.fitView({padding:.17,duration:250})};
 const resetDraft=()=>{if(!confirm('Lokalen Entwurf verwerfen und OTIF-Ausgangsknoten neu laden? Eine gespeicherte Server-Version bleibt erhalten.'))return;localStorage.removeItem(localKey);setActiveWorkspace(null);setDashboards({});setMetricNames({});initializedRef.current=false;setLocals({});setGlobals([]);setLoaded(false);setReloadKey(i=>i+1);say('Lokaler Entwurf zurückgesetzt')};
 const addNode=useCallback((type:PaletteType,position:{x:number;y:number})=>{if(!editMode||!canModify){say('Zum Hinzufügen zuerst den Bearbeitungsmodus mit Schreibrechten aktivieren.');return;}
  if(type==='connector'){say('Connector: Ziehe einen Verbindungspunkt an einem Knoten zu einem anderen Verbindungspunkt.');return;}
  remember();const label=type==='root'?'Neuer Ausgangsknoten':type==='metric'?'Neue KPI':type==='note'?'Neue Anmerkung':type==='condition'?'Neuer Filterknoten':type==='donut'?'Donut · On-Time':type==='bar'?'Balken · Segmentvergleich':type==='line'?'Zeitreihe · On-Time':type==='calculation'?'Vertragsstrafe · 0,75 €/kg':'Neue Aufgliederung';
  const analysis:AnalysisNode={id:'user:'+crypto.randomUUID(),parentId:null,label,kind:type==='root'?'root':type==='metric'?'metric':type==='note'?'note':type==='condition'?'condition':'segment',metricId:'otifRate',createdBy:'user',description:type==='note'?'Anmerkung':undefined,visualization:({donut:'donut',bar:'bar',line:'line',calculation:'calculation'} as Record<string,AnalysisNode['visualization']>)[type]||'kpi',chartDimension:'delivery_company',calculationTemplate:'total_penalty_eur'};
  setNodes(ns=>{
   let next={...position};
   for(let i=0;i<40;i++){
    if(!ns.some(n=>Math.abs(n.position.x-next.x)<250&&Math.abs(n.position.y-next.y)<180))break;
    const count=i+1;next={x:position.x+count%4*275,y:position.y+Math.floor(count/4)*205};
   }
   return [...ns,nodeFor(analysis,next)];
  });setSelectedId(analysis.id);say('Knoten hinzugefügt. Einstellungen über das Zahnrad am Knoten konfigurieren.');
 },[editMode,canModify,remember,setNodes,say]);
 const removeNode=(id:string)=>{const n=nodes.find(n=>n.id===id);if(!editMode||!canModify||!n)return;if(!confirm('Knoten und seine Verbindungen entfernen?'))return;remember();setNodes(ns=>ns.filter(n=>n.id!==id));setEdges(es=>es.filter(e=>e.source!==id&&e.target!==id));if(selectedId===id)setSelectedId(nodes.find(n=>n.id!==id)?.id||ROOT_ID);say('Knoten entfernt');};
 const applyFilter=(f:Filter)=>{if(canModify)setDirty(true);if(dialog?.kind==='global'){setGlobals(gs=>{try{return validateFilters([...gs,f])}catch(e){say((e as Error).message);return gs}})}else if(dialog?.id){setLocals(old=>{const current=old[dialog.id!]||[];try{return {...old,[dialog.id!]:validateFilters([...current,f])}}catch(e){say((e as Error).message);return old}})} };
 const removeGlobal=(id:string)=>{setGlobals(gs=>gs.filter(f=>f.id!==id));if(canModify)setDirty(true)};
 const share=async()=>{const data={v:1,g:globals.map(({field,op,value})=>({field,op,value})),selected:selectedId};const u=new URL(location.href);u.searchParams.set('view',btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''));try{await navigator.clipboard.writeText(u.toString());say('Link kopiert. Lokale Knotenfilter werden nicht mitgeteilt.')}catch{say('Zwischenablage nicht verfügbar. URL bitte manuell kopieren.')}};
 const triggerReload=()=>{clearAnalyticsCache();setReloadKey(v=>v+1)};
 useEffect(()=>{const query=new URLSearchParams(location.search).get('view');if(!query)return;try{const raw=JSON.parse(decodeURIComponent(escape(atob(query.replace(/-/g,'+').replace(/_/g,'/')))));if(raw.v!==1)return;const gs=validateFilters((raw.g||[]).map((f:Filter)=>({...f,id:crypto.randomUUID()})));setGlobals(gs);if(typeof raw.selected==='string')setSelectedId(raw.selected);}catch{say('Ungültiger Ansichtslink ignoriert.')}},[]);
 useEffect(()=>{analysisApi.dimensions().then(setDimensions).catch(e=>setWarning('Filterkatalog konnte nicht geladen werden: '+e.message));},[]);
 // Initialize the graph independently from network responses. A timeout cannot
 // leave the user with an empty graph or prevent the workspace from opening.
 useEffect(()=>{
  if(initializedRef.current)return;
  const base=createBlankWorkspaceGraph();
  let recovered=false;
  const saved=localStorage.getItem(localKey);
  if(saved){
   try{
    const draft=cleanDraft(JSON.parse(saved));
    if(draft){
     const graph=restoreDraft(draft);
     setNodes(graph.nodes);setEdges(graph.edges);
     setLocals(draft.localFilters||{});
     viewportRef.current=draft.viewport;
     setTimeout(()=>void flow.setViewport(draft.viewport),120);
     recovered=true;
    }
   }catch{/* invalid browser draft ignored */}
  }
  if(!recovered){setNodes(base.nodes);setEdges(base.edges);}
  initializedRef.current=true;setLoaded(true);
 },[localKey]);
 useEffect(()=>{
  const run=++requestRef.current;
  setBusy(true);setWarning('');
  // Load the KPI first; a timed-out trend must never invalidate valid KPIs.
  const fetchAll=async()=>{
   const [metricsResult,trendResult]=await Promise.allSettled([
    analysisApi.metrics(globals),analysisApi.trend(globals)
   ]);
   if(run!==requestRef.current)return;
   if(metricsResult.status==='fulfilled'){
    const m=metricsResult.value;
    setRootMetrics(m);
    setRibbon({...m,deliveryDateCount:m.dateCoverage??0} as Ribbon);
   }else{
    setWarning('KPI-Abfrage nicht verfügbar: '+String(metricsResult.reason instanceof Error?metricsResult.reason.message:metricsResult.reason));
   }
   if(trendResult.status==='fulfilled')setRibbonTrend(trendResult.value);
   else setRibbonTrend([]);
   setBusy(false);
  };
  void fetchAll();
  return()=>{requestRef.current++};
 },[globals,reloadKey]);
 useEffect(()=>{if(!initializedRef.current||!loaded)return;let filt:Filter[];try{filt=effective(selectedId);}catch(e){setDetail({...emptyDetail,error:e instanceof Error?e.message:'Ungültiger Analysezweig'});return}
 const idx=++detailRequest.current;setDetail(old=>({...old,pending:true,error:null,metrics:null,trend:[],breakdown:[]}));
 Promise.all([analysisApi.metrics(filt),analysisApi.trend(filt),analysisApi.breakdown('delivery_company',filt),analysisApi.ribbon(filt)]).then(([metrics,trend,breakdown,ribbon])=>{
  if(idx!==detailRequest.current)return;setDetail({metrics,trend,breakdown,ribbon,pending:false,error:null});
  setNodes(ns=>ns.map(n=>n.id===selectedId?{...n,data:{...n.data,orders:metrics.orders,onTimeRate:metrics.onTimeRate}}:n));
 }).catch(e=>{if(idx===detailRequest.current)setDetail({...emptyDetail,error:e instanceof Error?e.message:'Analyse nicht verfügbar'});});
 return()=>{detailRequest.current++};
 },[selectedId,globals,locals,loaded,graphFilterKey]);
 const saveNodeSettings=(id:string,patch:Partial<AnalysisNode>)=>{
  if(!canModify)return;
  remember();setNodes(ns=>ns.map(n=>n.id===id?{...n,data:{...n.data,analysis:{...n.data.analysis,...patch,id:n.id}}}:n));
  setDirty(true);say('Knoten aktualisiert; Filter und Diagramm werden neu berechnet.');
 };
 // Visible cards use the same inherited predicates as detail dashboards.
 // A stable semantic key prevents metric updates from starting new requests.
 useEffect(()=>{
  if(!loaded)return;
  const run=++graphRequest.current;
  const ordinary=topology.nodes.filter(a=>a.kind!=='note');
  setNodes(old=>old.map(n=>n.data.analysis.kind==='note'?n:{...n,data:{...n.data,busy:true,error:undefined}}));
  const metricPromises=new Map<string,ReturnType<typeof analysisApi.metrics>>();
  const breakdownPromises=new Map<string,ReturnType<typeof analysisApi.breakdown>>();
  const trendPromises=new Map<string,ReturnType<typeof analysisApi.trend>>();
  const calculations=new Map<string,ReturnType<typeof analysisApi.calculated>>();
  const update=(id:string,patch:Partial<NNode['data']>)=>{
   if(run!==graphRequest.current)return;
   setNodes(old=>old.map(n=>n.id===id?{...n,data:{...n.data,...patch,busy:false}}:n));
  };
  const tasks=ordinary.map(a=>async()=>{
   try{
    const filters=effectiveFilters(globals,topology.nodes,locals,a.id,topology.edges);
    const contradictions=conflictingFields(filters);
    if(contradictions.length){
     update(a.id,{orders:0,onTimeRate:null,chartRows:[],trendRows:[],calculation:undefined,error:'Keine passenden Aufträge: widersprüchliche Filter ('+contradictions.map(f=>fieldNames[f]).join(', ')+').',filterSummary:'Filterkonflikt'});
     return;
    }
    const key=filterSignature(filters);
    let promise=metricPromises.get(key);
    if(!promise){promise=analysisApi.metrics(filters);metricPromises.set(key,promise)}
    const metrics=await promise;
    if(run!==graphRequest.current)return;
    const viz=a.visualization||'kpi';
    const chosen=(a.metricId==='otd'?'onTimeRate':a.metricId&&Object.prototype.hasOwnProperty.call(METRIC_LABELS,a.metricId)?a.metricId:'otifRate') as MetricKey;
    const patch:Partial<NNode['data']>={orders:metrics.orders,onTimeRate:metrics.onTimeRate,primaryValue:metricValue(chosen,metrics,null),primaryLabel:METRIC_LABELS[chosen],filterSummary:filters.map(f=>formatFilter(f,fieldNames)).join(' · '),error:undefined,chartRows:undefined,calculation:undefined};
    if(viz==='bar'){
      const dimension=a.chartDimension||'delivery_company';
      const chartKey=key+':'+dimension;
      let lookup=breakdownPromises.get(chartKey);
      if(!lookup){lookup=analysisApi.breakdown(dimension,filters);breakdownPromises.set(chartKey,lookup)}
      patch.chartRows=await lookup;
    }else if(viz==='line'){
      let lookup=trendPromises.get(key);
      if(!lookup){lookup=analysisApi.trend(filters);trendPromises.set(key,lookup)}
      patch.trendRows=await lookup;
    }else if(viz==='calculation'){
      const template=a.calculationTemplate||'shortfall_kg';
      const calcKey=key+':'+template+':'+(a.rateEurPerKg??'');
      let lookup=calculations.get(calcKey);
      if(!lookup){lookup=analysisApi.calculated(template,filters,a.rateEurPerKg);calculations.set(calcKey,lookup)}
      patch.calculation=await lookup;
    }
    update(a.id,patch);
   }catch(e){update(a.id,{error:e instanceof Error?e.message:'Knotendaten konnten nicht geladen werden'});}
  });
  let next=0;
  const worker=async()=>{while(next<tasks.length&&run===graphRequest.current){const at=next++;await tasks[at]()}}
  void Promise.all(Array.from({length:Math.min(5,tasks.length)},()=>worker()));
  return()=>{graphRequest.current++};
 },[graphFilterKey,globals,locals,loaded]);
 const split=async(id:string,field:FieldKey)=>{const f=effective(id);const rows=await analysisApi.breakdown(field,f);if(!rows.length)throw Error('Keine Teilgruppen für diese Filter verfügbar');
  remember();const next=splitGraph(nodes,edges,id,field,rows);setNodes(next.nodes);setEdges(next.edges);say(rows.length+' Teilgruppen geladen');};
 const pageSearch=(term:string)=>{setSearch(term);if(term.trim().length<2)return;const item=nodes.find(n=>n.data.analysis.label.toLowerCase().includes(term.toLowerCase()));if(item){setSelectedId(item.id);setView('analytics');void flow.fitView({nodes:[{id:item.id}],duration:250,padding:.6});}};
 const modeActions={nodes,edges,onNodesChange:onNodeChanges,onEdgesChange:onEdgeChanges,onConnect:connect,onSelect:setSelectedId,onSelectionClear:()=>{},selectedId,editMode,onEditToggle:()=>{if(canModify)setEditMode(v=>!v)},onFilter:(id:string)=>setDialog({kind:'node',id}),onSplit:(id:string)=>setDialog({kind:'split',id}),onRemove:removeNode,onConfigure:(id:string)=>{setSelectedId(id);setConfigureNodeId(id)},onExplain:(id:string)=>{setSelectedId(id);setRightVisible(true);setSelectedTab('Berechnungslogik')},onAdd:addNode,onSave:saveDraft,onReset:resetDraft,onGraphMove:()=>{setDirty(true);},onGraphStart:remember,onUndo:undo,onRedo:redo,fieldNames,onViewportChange:(v:Viewport)=>{viewportRef.current=v;},fullscreen,setFullscreen,canEdit:canModify,dirty,onHelp:()=>handleSetView('builder')};
 return <div className={'app-shell '+(collapsed?'sidebar-collapsed':'')}><Header userEmail={email} onSignOut={onSignOut} onProfile={()=>handleSetView('profile')} onSearch={pageSearch} onHelp={()=>setHelp(true)}/>
  <Sidebar view={view} onNavigate={handleSetView} collapsed={collapsed} setCollapsed={setCollapsed} role={role}/>
  <main className="app-main">
   {(['analytics','tree','builder','home'] as View[]).includes(view)?<>
    <div className="page-title-row"><div className="page-heading"><Icon name="chart-column" size={28}/><div><h1>{view==='tree'?'Decision Tree':view==='builder'?'Dashboard Builder':view==='home'?'Willkommen bei NXT Analytics':'KPI-Analyse'}</h1><p>Interaktive Ursachenanalyse mit Decision Tree · {PROJECT.years}</p></div></div><div className="top-actions"><Button icon="save" onClick={()=>void saveDraft()} disabled={!canModify||saving}>{saving?'Speichert …':'Speichern'}</Button><Button icon="share-2" onClick={share}>Teilen</Button><Button icon="layout-dashboard" onClick={()=>{setRightVisible(true);setFullDashboard(true)}}>Dashboard öffnen</Button>{canModify&&<Button icon="type" onClick={()=>setNameDialog('node')}>Knotenname</Button>}{canModify&&<Button icon="settings" onClick={()=>setNameDialog('metrics')}>KPI-Titel</Button>}<Button kind="primary" icon="play" onClick={triggerReload} disabled={busy}>Analyse ausführen</Button></div></div>
    {warning&&<Notice kind="warning">{warning}</Notice>}
    <WorkspaceControls workspaces={workspaces} active={activeWorkspace} canEdit={canModify} role={role} saving={saving} onSelect={id=>void selectWorkspace(id)} onCreate={name=>void createWorkspace(name)} onSave={()=>void saveDraft()} onToggleShare={()=>void toggleShare()} onRemove={()=>void removeWorkspace()}/>
    <MetricRibbon ribbon={ribbon} trend={ribbonTrend} pending={busy} names={metricNames} onExplain={metric=>setLogicContext({metric,nodeId:null})}/>
    <FilterStrip globals={globals} fieldNames={fieldNames} onRemove={removeGlobal} onAdd={()=>setDialog({kind:'global'})} onReset={()=>{setGlobals([]);if(canModify)setDirty(true)}} onShare={share}/>
    {view==='builder'?<DashboardBuilder nodeId={selectedId} nodeLabel={selectedNode?.data.analysis.label||'Knoten'} nodeOptions={nodes.filter(n=>n.data.analysis.kind!=='note').map(n=>({id:n.id,label:n.data.analysis.label}))} onSelectNode={setSelectedId} dashboard={currentDashboard} onChange={updateDashboard} detail={detail} filters={effective()} onBack={()=>handleSetView('analytics')} onSave={()=>void saveDraft()} canEdit={canModify} saving={saving} fieldNames={fieldNames} allowedFields={allowedFields}/>:
      <><div className={'workspace-row '+(!rightVisible?'no-detail':'')}><CanvasWithFlow {...modeActions}/>{rightVisible&&<DetailPanel node={selectedNode} detail={detail} tab={selectedTab} setTab={setSelectedTab} onClose={()=>setRightVisible(false)} onExpand={()=>setFullDashboard(true)} onRename={()=>setNameDialog('node')} onFilter={()=>setDialog({kind:'node',id:selectedId})} dashboard={currentDashboard} filters={effective()} fieldNames={fieldNames} filterTrace={traceFilters(globals,analysisNodes,locals,selectedId,topology.edges)} onExplain={metric=>setLogicContext({metric,nodeId:selectedId})} onEdit={()=>handleSetView('builder')} canEdit={canModify}/>}</div>
      {!rightVisible&&<button className="detail-reopen" onClick={()=>setRightVisible(true)}><Icon name="layers" size={17}/> Detaildashboard einblenden</button>}</>}
    <div className="bottom-disclaimer">Analyse-Ansicht · Datenbasis WoodCorp {PROJECT.years} · Das Referenzdesign enthält illustrative, nicht übernommene Beispielwerte. {isEditing(role)?'Private Entwürfe können in Supabase gespeichert und für das Team freigegeben werden.':''}</div>
   </>:view==='workspaces'?<WorkspaceOverview items={workspaces} userId={userId} role={role} busy={saving} onOpen={id=>{void selectWorkspace(id).then(ok=>{if(ok)handleSetView('analytics')})}} onCreate={title=>{void createWorkspace(title).then(ok=>{if(ok)handleSetView('analytics')})}} onDelete={deleteWorkspace} onRefresh={()=>void reloadWorkspaces()}/>:
     view==='data'?<DataExplorer dimensions={dimensions}/>:
     view==='filters'?<FilterCatalogV4 rows={catalog} candidates={candidates} admin={role==='admin'} busy={catalogBusy} onRefresh={()=>{void reloadCatalog();void reloadCandidates()}} onToggle={(field,enabled)=>void toggleCatalog(field,enabled)} onRegister={addCatalogField} onRename={renameCatalogField}/>:view==='team'?<TeamPanel role={role}/>:<ProfilePage email={email} role={role}/>}
  </main>
  {dialog&&dialog.kind!=='split'&&<FilterDialog target={{kind:dialog.kind==='global'?'global':'node',id:dialog.id}} dimensions={dimensions} allowedFields={allowedFields} fieldNames={fieldNames} onApply={applyFilter} onClose={()=>setDialog(null)}/>}
  {dialog?.kind==='split'&&<SplitDialog nodeName={nodes.find(n=>n.id===dialog.id)?.data.analysis.label||'Knoten'} dimensions={dimensions} allowedFields={allowedFields} fieldNames={fieldNames} onSplit={field=>split(dialog.id!,field)} onClose={()=>setDialog(null)}/>}
  {fullDashboard&&<DashboardFullView title={selectedNode?.data.analysis.label||'Knoten-Dashboard'} dashboard={currentDashboard} detail={detail} filters={effective()} onClose={()=>setFullDashboard(false)} onEdit={()=>{setFullDashboard(false);handleSetView('builder')}} onExplain={metric=>{setFullDashboard(false);setLogicContext({metric,nodeId:selectedId})}} canEdit={canModify}/>}
  {logicContext&&<Modal title={'Berechnungslogik · '+METRIC_LABELS[logicContext.metric]} onClose={()=>setLogicContext(null)}><CalculationLogic metric={logicContext.metric} metrics={logicContext.nodeId?detail.metrics:ribbon} trace={logicContext.nodeId?traceFilters(globals,analysisNodes,locals,logicContext.nodeId,topology.edges):globals.map(filter=>({nodeId:null,sourceLabel:'Global',filter,scope:'global' as const}))} fieldNames={fieldNames}/></Modal>}
   {nameDialog==='node'&&<RenameNodeDialog label={selectedNode?.data.analysis.label||'KPI'} onSave={renameSelectedNode} onClose={()=>setNameDialog(null)}/>}
  {nameDialog==='metrics'&&<KpiNameDialog names={metricNames} onSave={names=>{if(canModify){setMetricNames(names);setDirty(true);say('KPI-Titel aktualisiert. Im Workspace speichern.')}}} onClose={()=>setNameDialog(null)}/>}
  {configureNodeId&&nodes.find(n=>n.id===configureNodeId)&&<NodeSettings node={nodes.find(n=>n.id===configureNodeId)!.data.analysis} allowedFields={allowedFields} fieldNames={fieldNames} filters={locals[configureNodeId]||[]} onRemoveFilter={fid=>{if(!canModify)return;setLocals(old=>({...old,[configureNodeId]:(old[configureNodeId]||[]).filter(f=>f.id!==fid)}));setDirty(true)}} onSave={patch=>saveNodeSettings(configureNodeId,patch)} onClose={()=>setConfigureNodeId(null)}/>}
  {help&&<Modal title="NXT Analytics – Bedienung" onClose={()=>setHelp(false)}><div className="help-copy"><p><b>Analysieren:</b> Knoten auswählen, global filtern und im rechten Dashboard die Detaildaten ansehen.</p><p><b>Bearbeiten:</b> Im Bearbeitungsmodus Knoten frei verschieben, Notizen aus der Palette ziehen und Verbindungspunkte mit der Maus verbinden. Jede neu gezeichnete Linie überträgt Filter in Pfeilrichtung; Rückverbindungen, die einen Zyklus bilden würden, werden verhindert.</p><p><b>Split:</b> Über die Knoten-Aktion eine Dimension auswählen. Die Filter jedes Vorgängers werden entlang aller eingehenden Pfeile vererbt (UND). Im Canvas lassen sich außerdem Balken-, Donut- und Zeitreihendiagramme sowie sichere SQL-Kennzahlen hinzufügen.</p><p><b>Speichern:</b> Änderungen lassen sich in privaten Supabase-Workspaces speichern und später für alle Projektmitglieder veröffentlichen. Dashboard-Widgets werden pro Knoten gesichert.</p></div></Modal>}
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