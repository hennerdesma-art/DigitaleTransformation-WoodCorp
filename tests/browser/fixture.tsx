import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ReactFlowProvider,useNodesState,useEdgesState} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../../src/styles/tokens.css';import '../../src/styles/app.css';import '../../src/styles/dashboard.css';import '../../src/styles/v4.css';import '../../src/styles/v5.css';import '../../src/styles/v6.css';import '../../src/styles/v7.css';import '../../src/styles/v8.css';import '../../src/styles/v9.css';import '../../src/styles/v10.css';import '../../src/styles/chart-cards.css';import '../../src/styles/intelligence.css';import '../../src/styles/research.css';
import {IntelligencePanel} from '../../src/components/IntelligencePanel';
import {intelligenceApi} from '../../src/lib/intelligence';
import {applyAssistantPlan,assistantFingerprint,type AssistantState} from '../../src/core/assistant';
import {AI_GRAPH_FORMAT,KNOWLEDGE_VERSION,action} from '../../src/core/assistantProtocol';
import {ResearchExplorer,ResearchWidget} from '../../src/components/ResearchExplorer';
import {SmartLayoutDialog} from '../../src/components/SmartLayoutDialog';
import {CanvasWithFlow} from '../../src/components/GraphCanvas';
import {ChartAccess} from '../../src/components/InteractiveCharts';
import {analysisApi} from '../../src/lib/supabase';
import {nodeFor,semanticEdge,annotationEdge,type NNode,type NEdge} from '../../src/core/graph';
import {commitLayout,workspaceIssues} from '../../src/core/smartLayout';
import {freshWidget,makeDocument,validDocument,type DashboardWidget} from '../../src/core/dashboard';
import {serializeDraft,restoreDraft} from '../../src/core/graph';
import {makeFilter} from '../../src/core/filters';
import {FIELD_LABELS,CHART_SEGMENT_FIELDS,type FieldKey} from '../../src/config';
import type {ResearchSpec,ResearchResponse,GroupRow,CaseRow} from '../../src/core/research';
import type {Filter} from '../../src/core/types';

const qs=new URLSearchParams(location.search),mode=qs.get('mode')||'research',readonly=qs.has('readonly');
const fields=[...new Set([...CHART_SEGMENT_FIELDS,'process_variant','cust_id','cust_name','order_received_date','promised_date'] as FieldKey[])];
const context=[makeFilter('factory','Testwerk','local')];
const s=(n=100,k=60):GroupRow=>({labels:[],orders:n,date_n:n,on_time_n:k,volume_n:n,in_full_n:k,otif_n:n,otif_ok:k,late_eligible:n,late_kg_orders:n-k,late_kg:(n-k)*100,short_eligible:n,short_orders:n-k,short_kg:(n-k)*20,ordered_kg:n*200,delivered_kg:n*180,late_cost:(n-k)*75,short_cost:(n-k)*15,total_cost:(n-k)*90});
const meta={definitionVersion:'synthetic-test',researchVersion:1,penaltyRate:.75};
const testCase:CaseRow={case_key:'TEST-001',factory:'Testwerk',product_type:'Crates',cust_id:'test-id',cust_name:'Synthetic Customer',cust_country:'DE',ordered_quantity:1000,delivered_quantity:900,delivered_quantity_unit:'kg',promised_date:'2019-05-10T00:00:00',delivered_date:'2019-05-12T00:00:00',status:'late_not_full',delay_days:2,quantity_change_count:1,process_variant:'OR>CS>SP>FP>LS>GD',process_order_quality:'Test',late_cost:675,short_cost:75,total_cost:750};
let failNext=qs.has('error');
Object.assign(analysisApi,{
 segments:async()=>['0','1','2'].map(label=>({label,orders:50,otif_rate:50,on_time_rate:60,volume_rate:70})),
 research:async(mode:string,filters:Filter[],opts:Record<string,unknown>):Promise<ResearchResponse>=>{
  await new Promise(r=>setTimeout(r,80));
  if(failNext){failNext=false;throw Error('Synthetischer Testfehler');}
  if(!filters.some(f=>f.field==='factory'&&f.value==='Testwerk'))throw Error('Synthetic fixture: inherited filter lost');
  const dimensions=(opts.dimensions||[]) as ResearchResponse['dimensions'];
  if(mode==='catalog')return {...meta,activityNames:['Order received','Confirm sale','Start production','Finished production','Load shipment','Change quantity','Goods delivered']};
  if(mode==='conformance'||mode==='patterns')return {...meta,researchVersion:2,cases:100,baseline:s(),reference:mode==='conformance'?(opts.reference||['Order received','Confirm sale','Start production']) as string[]:undefined,pattern:opts.pattern as ResearchResponse['pattern'],rows:[{...s(60,45),status:'match'},{...s(30,12),status:'no_match'},{...s(10,3),status:'unknown'}],rules:[{orders:100,rule:'Order received → Confirm sale',matched_cases:60,deviation_cases:30,unknown_cases:10}]};
  if(mode==='rework')return {...meta,researchVersion:2,cases:100,representedCases:100,events:400,rows:[{orders:100,activity:'Change quantity',events:125,present_cases:80,repeated_cases:30,repeat_events:45,single_otif_n:50,single_otif_ok:40,repeated_otif_n:30,repeated_otif_ok:10,total_cost:900}]};
  if(mode==='bottlenecks')return {...meta,researchVersion:2,cases:100,events:400,retained:398,eligibleTransitions:180,links:[{source:'Order received',target:'Start production',transitions:100,cases:100,valid_duration:100,median_days:2,p90_days:4,total_days:250,total_cost:3600,otif_n:100,otif_ok:60},{source:'Start production',target:'Load shipment',transitions:80,cases:80,valid_duration:80,median_days:5,p90_days:8,total_days:500,total_cost:2200,otif_n:80,otif_ok:40}]};
  if(mode==='cases')return {...meta,total:opts.search&&opts.search!=='TEST'?0:1,rows:opts.search&&opts.search!=='TEST'?[]:[testCase]};
  if(mode==='case')return {...meta,case:opts.caseKey===testCase.case_key?testCase:null,events:[{event_id:1,activity:'Order received',eventtime:'2019-05-01T08:00:00',sorting:0,anomaly:false},{event_id:2,activity:'Start production',eventtime:'2019-05-03T08:00:00',sorting:30,anomaly:false},{event_id:3,activity:'Change quantity',eventtime:'2019-05-03T08:00:00',sorting:170,anomaly:false},{event_id:4,activity:'Goods delivered',eventtime:'2019-05-10T00:00:00',sorting:60,anomaly:false}]};
  if(mode==='process')return {...meta,cases:100,representedCases:100,events:400,retained:398,sequence:String(opts.sequence),activities:[{activity:'Order received',events:100,cases:100,display_order:0},{activity:'Start production',events:100,cases:100,display_order:30},{activity:'Change quantity',events:98,cases:98,display_order:170},{activity:'Goods delivered',events:100,cases:100,display_order:60}],links:[{source:'Order received',target:'Start production',transitions:100,cases:100,valid_duration:100,median_days:2,p90_days:4},{source:'Start production',target:'Change quantity',transitions:98,cases:98,valid_duration:0,median_days:null,p90_days:null},{source:'Change quantity',target:'Goods delivered',transitions:98,cases:98,valid_duration:96,median_days:6,p90_days:8}]};
  if(mode==='variants')return {...meta,total:1,baseline:s(),sequence:'chronological',dimensions:['process_variant'],rows:[{...s(40,10),labels:['Order received → {Change quantity + Start production} → Goods delivered'],variant_key:'a'.repeat(32)}]};
  if(mode==='compare')return {...meta,total:100,dimensions,rows:[{...s(40,32),arm:'A',labels:['Crates']},{...s(30,12),arm:'B',labels:['Crates']},{...s(10,8),arm:'A',labels:['Pallets']},{...s(20,6),arm:'B',labels:['Pallets']}]};
  if(mode==='quality')return {...meta,checks:{orders:100,distinct_keys:100,events:400,chronological_plausible:70,missing_events:0,missing_features:0,missing_intervals:0,missing_dates:0,missing_tolerance:0,other_units:1,missing_quantity:0,negative_quantity:0,date_flag_checked:100,date_flag_mismatch:10,tolerance_checked:100,tolerance_mismatch:20,alternate_quantity_checked:100,alternate_quantity_mismatch:25,bad_time_cases:1,tied_cases:40,multiple_goods_delivered:0,tied_events:80,bad_time_events:2,gd_actual_match:60,gd_actual_n:100,gd_promise_match:100,gd_promise_n:100},activities:[{activity:'Confirm sale',present:99,total:100}],intervals:[{name:'order_to_start',total:100,present:99,negative:20,valid:79,median_days:3,p90_days:8}],orphanEvents:null};
  return {...meta,total:dimensions?.length?2:1,baseline:s(),dimensions,rows:dimensions?.length?[{...s(60,40),labels:dimensions.map(d=>d==='product_type'?'Crates':d==='process_variant'?'OR>CS>SP>FP>LS>GD':'Testwerk')},{...s(40,20),labels:dimensions.map(d=>d==='product_type'?'Pallets':d==='process_variant'?'OR>SP>FP>LS>GD':'Testwerk')}]:[s()]};
 }
});
function ResearchFixture(){
 const [open,setOpen]=useState(true),[pinned,setPinned]=useState<ResearchSpec|null>(null),[finding,setFinding]=useState(''),[widget,setWidget]=useState<DashboardWidget>(()=>freshWidget('research'));
 if(mode==='widget')return <ChartAccess.Provider value={{fields,saveView:readonly?undefined:(_id,patch)=>setWidget(w=>({...w,...patch}))}}><div style={{padding:16,width:'min(900px,100%)',boxSizing:'border-box'}}><output id="qa-saved">{JSON.stringify(widget.research)}</output><ResearchWidget widget={widget} filters={context}/></div></ChartAccess.Provider>;
 return <><button type="button" onClick={()=>setOpen(true)}>Analyse öffnen</button><output id="qa-pin">{JSON.stringify(pinned)}</output><output id="qa-finding">{finding}</output>{open&&<ResearchExplorer title="Testanalyse" filters={context} allowedFields={fields} onClose={()=>setOpen(false)} onPin={readonly?undefined:spec=>setPinned(spec)} onFinding={readonly?undefined:(t,b)=>setFinding(t+':'+b)}/>}</>;
}
const no=()=>{};
function CanvasFixture(){
 const root=nodeFor({id:'root',kind:'root',label:'Executive Overview',parentId:null,createdBy:'user',metricId:'otifRate'},{x:100,y:80});
 const g=nodeFor({id:'group',kind:'container',label:'Analysebereich',parentId:null,createdBy:'user',containerWidth:520,containerHeight:340},{x:120,y:150});
 const a=nodeFor({id:'a',kind:'metric',label:'Vergleich',parentId:null,createdBy:'user',containerId:'group',visualization:'bar'},{x:18,y:86});
 const b=nodeFor({id:'b',kind:'metric',label:'KPI',parentId:null,createdBy:'user',containerId:'group'},{x:20,y:100});
 const note=nodeFor({id:'finding',kind:'note',label:'Finding',parentId:null,createdBy:'user',description:'Synthetic evidence'},{x:220,y:160});
 const [nodes,setNodes,onNodesChange]=useNodesState<NNode>([root,g,a,b,note]),[edges,setEdges,onEdgesChange]=useEdgesState<NEdge>([semanticEdge('root','group'),annotationEdge('a','finding')]);
 const [selected,setSelected]=useState('root'),[previous,setPrevious]=useState<NNode[]|null>(null),[research,setResearch]=useState('');
 const [edit,setEdit]=useState(!readonly),[full,setFull]=useState(false);
 const issues=workspaceIssues(nodes,edges,[],{},{}),overlap=issues.filter(i=>i.title==='Überlappung').length;
 return <ChartAccess.Provider value={{fields}}><output id="qa-overlap">{overlap}</output><output id="qa-research">{research}</output><button type="button" onClick={()=>{if(previous)setNodes(previous)}}>Test Undo</button><div style={{height:'calc(100vh - 60px)',display:'grid',minWidth:0}}><CanvasWithFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={no} globals={[]} locals={{}} onRemoveEdge={no} onSelect={setSelected} onSelectionClear={no} selectedId={selected} editMode={edit} onEditToggle={()=>setEdit(v=>!v)} onFilter={no} onSplit={no} onRemove={no} onConfigure={no} onExplain={no} onAdd={no} onSave={no} onReset={no} onGraphMove={no} onGraphStart={no} onResizeCard={no} onToggleContainer={no} onUndo={()=>{if(previous)setNodes(previous)}} onRedo={no} onViewportChange={no} fieldNames={FIELD_LABELS} fullscreen={full} setFullscreen={setFull} canEdit={!readonly} dirty={false} onHelp={no} onResearch={id=>setResearch(id)} onApplyLayout={proposed=>{setPrevious(nodes);setNodes(commitLayout(nodes,proposed))}}/></div></ChartAccess.Provider>;
}
function IntelligenceFixture(){
 const [state,setState]=useState<AssistantState>(()=>({nodes:[nodeFor({id:'root',kind:'root',label:'Executive',parentId:null,createdBy:'user',metricId:'otifRate'},{x:0,y:0})],edges:[],globals:context,locals:{},dashboards:{root:{question:'',widgets:[]}},selectedId:'root',allowedFields:fields})),[open,setOpen]=useState(true),[called,setCalled]=useState(''),[previous,setPrevious]=useState<AssistantState|null>(null);
 Object.assign(intelligenceApi,{status:async()=>({enabled:true,knowledgeVersion:KNOWLEDGE_VERSION,graphFormat:AI_GRAPH_FORMAT,researchProtocol:1,remaining:10,modelLabel:'Synthetic'}),ask:async(prompt:string,ctx:any,_h:any,_signal:any,intent:any,continuation:boolean)=>{setCalled(JSON.stringify({prompt,intent,continuation,filters:ctx.filters}));return {answer:'Synthetic validated research plan',operations:intent==='answer_only'?[]:[action('add_branch','root',{ref:'new:research',label:continuation?'Weitere Untersuchung':'Kontrollgruppen',widgetType:'research',value:'{"tab":"compare","exposure":"quantity_change_group","a":"0","b":"1","dimensions":["product_type"],"outcome":"volume","minN":10}'}),action('optimize_layout','root',{value:'hybrid'})]}}});
 const stamp=assistantFingerprint(state,null,null);
 return <><output id="qa-ai-called">{called}</output><output id="qa-ai-count">{state.nodes.length}</output><output id="qa-ai-config">{JSON.stringify(Object.values(state.dashboards).flatMap(d=>d.widgets.map(w=>w.research)))}</output><IntelligencePanel state={state} workspace={null} fingerprint={stamp} canEdit={!readonly} busy={false} onApply={(plan,fp)=>{if(fp!==stamp)throw Error('stale');setPrevious(state);setState(applyAssistantPlan(state,plan))}} onUndo={()=>{if(previous)setState(previous)}} onSelectNode={id=>setState(s=>({...s,selectedId:id}))} onOpenDashboard={()=>{}} open={open} onOpen={setOpen}/></>;
}
createRoot(document.getElementById('root')!).render(mode==='intelligence'?<IntelligenceFixture/>:mode==='canvas'?<ReactFlowProvider><CanvasFixture/></ReactFlowProvider>:<ResearchFixture/>);
