import React,{useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '../lib/supabase';
import type {FieldKey} from '../config';
import {FIELD_LABELS} from '../config';
import Icon from './Icon';
import {Button,Notice,Spinner} from './Ui';

type TableKey='woodcorp_cases'|'woodcorp_activities';
type Row=Record<string,unknown>;
type Col={key:string;label:string;type?:'date'|'number'|'bool'};
const CASE_COLS:Col[]=[
 {key:'case_key',label:'Case-Key'},{key:'factory',label:'Werk'},{key:'product_type',label:'Produkttyp'},
 {key:'delivery_company',label:'Lieferunternehmen'},{key:'cust_market',label:'Kundenmarkt'},
 {key:'cust_country',label:'Kundenland'},{key:'cust_addr_code',label:'Adresscode'},
 {key:'cust_id',label:'Kundennummer'},{key:'cust_name',label:'Kundenname'},
 {key:'ordered_quantity',label:'Bestellmenge',type:'number'},{key:'delivered_quantity',label:'Liefermenge',type:'number'},
 {key:'delivered_quantity_unit',label:'Einheit'},{key:'min_order_tolerance',label:'Min. Toleranz',type:'number'},
 {key:'max_order_tolerance',label:'Max. Toleranz',type:'number'},
 {key:'order_tolerance_met',label:'Mengentoleranz erfüllt',type:'number'},
 {key:'order_date_met',label:'Historisches Terminflag',type:'number'},
 {key:'days_to_del_deadline',label:'Tage bis Lieferfrist',type:'number'},
 {key:'warehouse_type',label:'Lagertyp'},
 {key:'promised_date',label:'Zugesagtes Datum',type:'date'},
 {key:'delivered_date',label:'Lieferdatum',type:'date'},
 {key:'sales_order_position_quantity',label:'Positionenmenge',type:'number'},
 {key:'order_value',label:'Auftragswert',type:'number'},{key:'unit_price',label:'Stückpreis',type:'number'}
];
const EVENT_COLS:Col[]=[
 {key:'event_id',label:'Event-ID',type:'number'},{key:'case_key',label:'Case-Key'},
 {key:'activity_en',label:'Aktivität'},{key:'eventtime',label:'Zeitpunkt',type:'date'},
 {key:'sorting',label:'Sortierung',type:'number'},{key:'is_timestamp_anomaly',label:'Zeitstempel-Anomalie',type:'bool'}
];
const DEFAULTS:Record<TableKey,string[]>={
 woodcorp_cases:['case_key','factory','product_type','delivery_company','ordered_quantity','delivered_quantity','promised_date','delivered_date'],
 woodcorp_activities:['event_id','case_key','activity_en','eventtime','sorting','is_timestamp_anomaly']
};
const PAGE_SIZE=40;
function stringify(value:unknown,col?:Col):string{
 if(value==null)return '–';
 if(col?.type==='bool')return value===true?'Ja':value===false?'Nein':String(value);
 if(col?.type==='number')return typeof value==='number'?value.toLocaleString('de-DE',{maximumFractionDigits:2}):String(value);
 if(col?.type==='date'){
  const d=new Date(String(value));
  return Number.isNaN(d.getTime())?String(value):d.toLocaleString('de-DE',{dateStyle:'medium',timeStyle:col.key==='eventtime'?'medium':undefined});
 }
 return String(value);
}
function safeSearch(v:string){return v.trim().replace(/[^a-zA-Z0-9._\-]/g,'').slice(0,100)}
export function DataExplorer({dimensions}:{dimensions:Record<string,string[]>}){
 const [table,setTable]=useState<TableKey>('woodcorp_cases');
 const [rows,setRows]=useState<Row[]>([]);
 const [count,setCount]=useState<number|null>(null);
 const [page,setPage]=useState(0);
 const [searchText,setSearchText]=useState('');
 const [search,setSearch]=useState('');
 const [columnFilter,setColumnFilter]=useState('factory');
 const [columnValue,setColumnValue]=useState('');
 const [direction,setDirection]=useState<'asc'|'desc'>('asc');
 const [sortBy,setSortBy]=useState('case_key');
 const [visible,setVisible]=useState<string[]>(DEFAULTS.woodcorp_cases);
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 const [refresh,setRefresh]=useState(0);
 const [detail,setDetail]=useState<Row|null>(null);
 const requestId=useRef(0);
 const cols=table==='woodcorp_cases'?CASE_COLS:EVENT_COLS;
 const columns=useMemo(()=>cols.filter(c=>visible.includes(c.key)),[table,visible]);
 const categorical=table==='woodcorp_cases'?['factory','product_type','delivery_company','warehouse_type','cust_country','cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met']:['activity_en','is_timestamp_anomaly'];
 const activeOptions=table==='woodcorp_cases'?dimensions[columnFilter]||[]:columnFilter==='is_timestamp_anomaly'?['true','false']:[];
 const changeTable=(next:TableKey)=>{
  setTable(next);setRows([]);setCount(null);setSearch('');setSearchText('');setColumnValue('');
  setColumnFilter(next==='woodcorp_cases'?'factory':'activity_en');
  setSortBy(next==='woodcorp_cases'?'case_key':'event_id');setDirection('asc');setPage(0);setDetail(null);
  setVisible([...DEFAULTS[next]]);
 };
 useEffect(()=>{
  const req=++requestId.current;const abort=new AbortController();
  const load=async()=>{setLoading(true);setError('');
   try{
    let query=supabase.from(table).select('*',{count:'exact'}).abortSignal(abort.signal);
    if(search)query=query.ilike('case_key',safeSearch(search)+'%');
    if(columnValue){
     if(columnFilter==='activity_en')query=query.ilike('activity_en','%'+columnValue.replace(/[%,()*]/g,'')+'%');
     else if(columnFilter==='is_timestamp_anomaly')query=query.eq('is_timestamp_anomaly',columnValue==='true');
     else if(categorical.includes(columnFilter))query=query.eq(columnFilter,columnValue);
    }
    const {data,error,count:total}=await query.order(sortBy,{ascending:direction==='asc'}).range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1);
    if(req!==requestId.current)return;
    if(error)throw error;
    setRows((data||[]) as Row[]);setCount(total??0);
   }catch(e){if(req===requestId.current&&!abort.signal.aborted){setRows([]);setCount(null);setError(e instanceof Error?e.message:'Daten konnten nicht geladen werden.');}}
   finally{if(req===requestId.current)setLoading(false)}
  };void load();return()=>{abort.abort();requestId.current++};
 },[table,page,search,columnFilter,columnValue,sortBy,direction,refresh]);
 const totalPages=count===null?0:Math.ceil(count/PAGE_SIZE);
 const sort=(key:string)=>{if(!cols.some(c=>c.key===key))return;setPage(0);if(sortBy===key)setDirection(v=>v==='asc'?'desc':'asc');else{setSortBy(key);setDirection('asc');}};
 const exportPage=()=>{
  if(!rows.length)return;const csv=[cols.map(c=>c.label),...rows.map(r=>cols.map(c=>String(r[c.key]??'')))].map(line=>line.map(v=>'"'+v.replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=table+'-seite-'+(page+1)+'.csv';a.click();URL.revokeObjectURL(url);
 };
 return <section className="content-page data-explorer">
  <header className="directory-heading"><div><div className="nxt-eyebrow">NXT · Datenbasis</div><h2><Icon name="database" size={27}/> Datenquellen</h2><p className="muted">Die beiden Originaltabellen als durchsuchbare Listen – mit serverseitigen Filtern, Sortierung und Seitenaufteilung.</p></div>
  <div className="directory-actions"><Button icon="refresh-cw" onClick={()=>setRefresh(n=>n+1)}>Aktualisieren</Button><Button icon="file-text" onClick={exportPage} disabled={!rows.length}>Seite exportieren</Button></div></header>
  <div className="data-source-tabs" role="tablist" aria-label="Datenquelle">{([['woodcorp_cases','Aufträge (Cases)','case_key'],['woodcorp_activities','Ereignisse (Activities)','event_id']] as const).map(([key,label])=><button type="button" role="tab" key={key} aria-selected={table===key} className={table===key?'active':''} onClick={()=>changeTable(key)}><Icon name={key==='woodcorp_cases'?'table-2':'network'} size={19}/>{label}</button>)}</div>
  <div className="data-explorer-tools">
   <form className="data-search" onSubmit={e=>{e.preventDefault();setPage(0);setSearch(searchText)}}><Icon name="search" size={18}/><input value={searchText} onChange={e=>setSearchText(e.target.value)} placeholder="Case-Key beginnt mit …" aria-label="Nach Case-Key suchen" maxLength={100}/><button className="nxt-button secondary" type="submit">Suchen</button></form>
   <label>Spaltenfilter<select value={columnFilter} onChange={e=>{setColumnFilter(e.target.value);setColumnValue('');setPage(0)}}>{categorical.map(key=><option key={key} value={key}>{cols.find(c=>c.key===key)?.label||FIELD_LABELS[key as FieldKey]||key}</option>)}</select></label>
   <label>Wert{activeOptions.length>0?<select value={columnValue} onChange={e=>{setColumnValue(e.target.value);setPage(0)}}><option value="">Alle</option>{activeOptions.map(v=><option key={v} value={v}>{v}</option>)}</select>:<input value={columnValue} onChange={e=>{setColumnValue(e.target.value);setPage(0)}} placeholder="Enthält …" maxLength={120}/>}</label>
   <details className="column-menu"><summary><Icon name="sliders-horizontal" size={16}/> Spalten ({visible.length})</summary><div className="column-choices">{cols.map(c=><label key={c.key}><input type="checkbox" checked={visible.includes(c.key)} onChange={e=>setVisible(old=>e.target.checked?[...old,c.key]:old.length>1?old.filter(x=>x!==c.key):old)}/>{c.label}</label>)}</div></details>
   <button type="button" className="nxt-button secondary" onClick={()=>{setSearch('');setSearchText('');setColumnValue('');setPage(0)}}><Icon name="refresh-cw" size={15}/> Filter zurücksetzen</button>
  </div>
  {error&&<Notice kind="error">Laden fehlgeschlagen: {error} <button type="button" onClick={()=>setRefresh(n=>n+1)}>Erneut versuchen</button></Notice>}
  <div className="data-list-info"><span>{loading?'Lade Datensätze …':count===null?'–':count.toLocaleString('de-DE')+' Datensätze'} · {table==='woodcorp_cases'?'Ein Datensatz je Auftrag':'Ein Datensatz je Prozessereignis'} · Nur Lesezugriff</span><span>Case-Key verknüpft beide Quellen</span></div>
  <div className="data-table-shell"><div className="data-table-scroll"><table className="data-grid-table"><thead><tr><th className="row-number">#</th>{columns.map(c=><th key={c.key}><button type="button" onClick={()=>sort(c.key)} title={'Nach '+c.label+' sortieren'}>{c.label}{sortBy===c.key?<span aria-label={direction==='asc'?'Aufsteigend':'Absteigend'}>{direction==='asc'?' ▲':' ▼'}</span>:null}</button></th>)}<th>Details</th></tr></thead>
   <tbody>{!loading&&rows.map((r,i)=><tr key={String(r[table==='woodcorp_cases'?'case_key':'event_id']??i)}><td className="row-number">{page*PAGE_SIZE+i+1}</td>{columns.map(c=><td key={c.key} title={stringify(r[c.key],c)}>{stringify(r[c.key],c)}</td>)}<td><button className="table-detail-btn" type="button" title="Alle Spalten ansehen" onClick={()=>setDetail(r)}><Icon name="external-link" size={16}/></button></td></tr>)}
   {loading&&<tr><td colSpan={columns.length+2}><Spinner text="Datensätze werden geladen …"/></td></tr>}
   {!loading&&!rows.length&&<tr><td colSpan={columns.length+2}><div className="widget-empty">Keine Einträge gefunden. Passe die Filter an.</div></td></tr>}</tbody></table></div></div>
  <footer className="data-pagination"><span>Seite {totalPages?Math.min(page+1,totalPages):0} von {totalPages}</span><div><Button icon="chevron-left" disabled={page<=0||loading} onClick={()=>setPage(p=>Math.max(0,p-1))}>Zurück</Button><Button icon="chevron-right" disabled={loading||page+1>=totalPages} onClick={()=>setPage(p=>p+1)}>Weiter</Button></div></footer>
  <p className="workspace-privacy-note"><Icon name="lock" size={16}/> Die Datenlisten sind durch Supabase Auth und Row Level Security geschützt. Rohdaten werden nicht verändert.</p>
  {detail&&<div className="data-record-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDetail(null)}}><div className="data-record-card" role="dialog" aria-modal="true" aria-label="Datensatzdetails"><header><h3>Datensatzdetails</h3><button type="button" className="icon-button" aria-label="Details schließen" onClick={()=>setDetail(null)}><Icon name="x"/></button></header><div className="record-fields">{cols.map(c=><div key={c.key}><small>{c.label}</small><span>{stringify(detail[c.key],c)}</span></div>)}</div></div></div>}
 </section>;
}
