import React,{useMemo,useState} from 'react';
import {smartLayout,workspaceIssues,layoutFingerprint,type LayoutMode} from '../core/smartLayout';
import {worldPosition,nodeLayoutSize,type NNode,type NEdge} from '../core/graph';
import type {NodeDashboard} from '../core/dashboard';
import type {Filter} from '../core/types';
import {Button,Modal,Notice,number} from './Ui';
import Icon from './Icon';
const MODES:Record<LayoutMode,{label:string;detail:string}>={hybrid:{label:'Hybrid',detail:'Kompakte Analysebereiche in logischen Ebenen'},tree:{label:'Decision Tree',detail:'Hierarchisch, mit größeren Abständen'},free:{label:'Freier Canvas',detail:'Nur prüfen – keine Positionen ändern'}};
function MiniLayout({nodes,edges}:{nodes:NNode[];edges:NEdge[]}){
 const byId=new Map(nodes.map(n=>[n.id,n])),visible=nodes.filter(n=>!n.data.analysis.containerId||!byId.get(n.data.analysis.containerId)?.data.analysis.containerCollapsed);
 const rects=visible.map(n=>({n,...worldPosition(n,nodes),...nodeLayoutSize(n)})),map=new Map(rects.map(r=>[r.n.id,r]));
 if(!rects.length)return <p>Keine Elemente vorhanden.</p>;
 const minX=Math.min(...rects.map(r=>r.x))-36,minY=Math.min(...rects.map(r=>r.y))-36,maxX=Math.max(...rects.map(r=>r.x+r.width))+36,maxY=Math.max(...rects.map(r=>r.y+r.height))+36;
 return <div className="nxt-layout-preview"><svg viewBox={[minX,minY,Math.max(1,maxX-minX),Math.max(1,maxY-minY)].join(' ')} role="img" aria-label="Vorschau der Kachelanordnung">
 {rects.filter(r=>r.n.data.analysis.kind==='container').map(r=><g key={r.n.id}><rect x={r.x} y={r.y} width={r.width} height={r.height} rx="14" fill="#e4f2f2" stroke="#8abfc1" strokeWidth="3"/><text x={r.x+15} y={r.y+31} fontSize="24" fill="#00666b">{r.n.data.analysis.label.slice(0,Math.floor(r.width/13))}</text></g>)}
 {edges.map(e=>{const a=map.get(e.source),b=map.get(e.target);if(!a||!b)return null;return <path key={e.id} d={'M '+(a.x+a.width/2)+' '+(a.y+a.height)+' V '+((a.y+a.height+b.y)/2)+' H '+(b.x+b.width/2)+' V '+b.y} stroke={e.data?.kind==='annotation'?'#87989b':'#008b92'} strokeWidth="3" strokeDasharray={e.data?.kind==='annotation'?'10 7':undefined} fill="none"/>})}
 {rects.filter(r=>r.n.data.analysis.kind!=='container').map(r=><g key={r.n.id}><rect x={r.x} y={r.y} width={r.width} height={r.height} rx="12" fill={r.n.data.analysis.kind==='root'?'#00666b':r.n.data.analysis.kind==='note'?'#f4ebd9':'#ffffff'} stroke="#8abfc1" strokeWidth="3"/><text x={r.x+12} y={r.y+30} fontSize="20" fill={r.n.data.analysis.kind==='root'?'white':'#183a40'}>{r.n.data.analysis.label.slice(0,Math.max(5,Math.floor(r.width/11)))}</text></g>)}
 </svg></div>;
}
export function SmartLayoutDialog({nodes,edges,globals,locals,dashboards,canEdit,onApply,onClose,onFocus}:{nodes:NNode[];edges:NEdge[];globals:Filter[];locals:Record<string,Filter[]>;dashboards:Record<string,NodeDashboard>;canEdit:boolean;onApply:(nodes:NNode[],stamp:string)=>void;onClose:()=>void;onFocus:(id:string)=>void}){
 const [mode,setMode]=useState<LayoutMode>(canEdit?'hybrid':'free'),[tab,setTab]=useState<'layout'|'health'>('layout'),[onlyErrors,setOnlyErrors]=useState(false),[error,setError]=useState('');
 const stamp=layoutFingerprint(nodes,edges),plan=useMemo(()=>smartLayout(nodes,edges,mode),[stamp,mode]),current=useMemo(()=>workspaceIssues(nodes,edges,globals,locals,dashboards),[nodes,edges,globals,locals,dashboards]),after=useMemo(()=>workspaceIssues(plan.nodes,edges,globals,locals,dashboards),[plan,nodes,edges,globals,locals,dashboards]);
 const overlaps=(x:typeof current)=>x.filter(i=>i.title==='Überlappung').length;
 const levels=[...new Set(plan.levels.rank.values())].sort((a,b)=>a-b);
 const focus=(id:string)=>{onClose();onFocus(id)};
 return <Modal title="Thinking Path · Smart Layout & Workspace-Check" onClose={onClose}><div className="nxt-layout-modal">
 <nav className="nxt-research-tabs" aria-label="Layoutwerkzeuge"><button type="button" aria-pressed={tab==='layout'} onClick={()=>setTab('layout')}>Anordnung</button><button type="button" aria-pressed={tab==='health'} onClick={()=>setTab('health')}>Workspace-Prüfung ({current.length})</button></nav>
 {tab==='layout'?<><p className="nxt-research-note">Nur Positionen und Containergrößen werden geändert. Kennzahlen, Filter, Finding-Texte und Verbindungen bleiben unverändert. Die Vorschau wird erst mit Übernehmen gespeichert.</p>
 <div className="nxt-layout-mode-grid">{(Object.entries(MODES) as [LayoutMode,typeof MODES[LayoutMode]][]).map(([id,m])=><button type="button" key={id} disabled={!canEdit&&id!=='free'} aria-pressed={mode===id} onClick={()=>{setMode(id);setError('')}}><Icon name={id==='hybrid'?'layout-grid':id==='tree'?'network':'move'} size={21}/><strong>{m.label}</strong><small>{m.detail}</small></button>)}</div>
 <div className="nxt-layout-compare"><div><h4>Bisher · {overlaps(current)} Überlappungen</h4><MiniLayout nodes={nodes} edges={edges}/></div><div><h4>Vorschau · {overlaps(after)} Überlappungen</h4><MiniLayout nodes={plan.nodes} edges={edges}/></div></div>
 {plan.warnings.map((w,i)=><Notice key={i} kind="warning">{w}</Notice>)}
 <details><summary>Analyseebenen & Navigation ({levels.length})</summary>{levels.map(level=><div className="nxt-layout-level" key={level}><strong>Ebene {level+1}</strong><div>{nodes.filter(n=>!n.data.analysis.containerId&&plan.levels.rank.get(n.id)===level).map(n=><button type="button" key={n.id} onClick={()=>focus(n.id)}>{n.data.analysis.label}</button>)}</div></div>)}</details>
 {error&&<Notice kind="error">{error}</Notice>}
 <div className="modal-actions"><Button onClick={onClose}>Schließen</Button><Button kind="primary" icon="check" disabled={!canEdit||mode==='free'||overlaps(after)>overlaps(current)} onClick={()=>{try{onApply(plan.nodes,stamp);onClose()}catch(e){setError(e instanceof Error?e.message:'Layout konnte nicht übernommen werden')}}}>Layout übernehmen</Button></div>
 <p className="nxt-research-note">Das übernommene Layout kann über Rückgängig wiederhergestellt werden. Bitte Workspace speichern.</p></>:<>
 <div className="nxt-research-stats"><div><small>Elemente</small><strong>{number(nodes.length)}</strong></div><div><small>Verbindungen</small><strong>{number(edges.length)}</strong></div><div><small>Fehler</small><strong>{number(current.filter(i=>i.kind==='error').length)}</strong></div><div><small>Prüfhinweise</small><strong>{number(current.filter(i=>i.kind==='warning').length)}</strong></div></div>
 <label className="nxt-research-check"><input type="checkbox" checked={onlyErrors} onChange={e=>setOnlyErrors(e.target.checked)}/> Nur Fehler anzeigen</label>
 <p className="nxt-research-note">Geprüft werden Geometrie, Verbindungskonsistenz, Filterpfade, verknüpfte Widgets, bekannte Abfragefehler und Finding-Snapshots. Eine bestandene Prüfung belegt nicht die fachliche Richtigkeit aller Interpretationen.</p>
 {!current.length?<Notice kind="success">Keine Auffälligkeiten in den geprüften Regeln.</Notice>:<div className="nxt-layout-issues">{current.filter(i=>!onlyErrors||i.kind==='error').map((i,k)=><div key={k} className={'nxt-layout-issue '+i.kind}><div><strong>{i.title}</strong><small>{i.detail}</small></div>{i.nodeId&&nodes.some(n=>n.id===i.nodeId)&&<Button onClick={()=>focus(i.nodeId!)}>Anzeigen</Button>}</div>)}</div>}
 <div className="modal-actions"><Button onClick={onClose}>Schließen</Button>{canEdit&&<Button kind="primary" onClick={()=>{setMode('hybrid');setTab('layout')}}>Layout optimieren</Button>}</div></>}
 </div></Modal>;
}
