import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ReactFlowProvider,useNodesState,useEdgesState} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../src/styles/tokens.css';import '../src/styles/app.css';import '../src/styles/dashboard.css';import '../src/styles/v4.css';import '../src/styles/v5.css';import '../src/styles/v6.css';import '../src/styles/v7.css';import '../src/styles/v8.css';import '../src/styles/v9.css';import '../src/styles/v10.css';import '../src/styles/chart-cards.css';import '../src/styles/intelligence.css';
import {CanvasWithFlow} from '../src/components/GraphCanvas';
import {DashboardBuilder,DashboardRenderer} from '../src/components/DashboardBuilder';
import {ChartAccess} from '../src/components/InteractiveCharts';
import {nodeFor,resizeGraphCard,type NNode,type NEdge} from '../src/core/graph';
import {cardDimensions} from '../src/core/cardLayout';
import {freshWidget,type NodeDashboard,type WidgetType} from '../src/core/dashboard';
import {FIELD_LABELS,CHART_SEGMENT_FIELDS} from '../src/config';
import {analysisApi} from '../src/lib/supabase';
import type {GraphViz,AnalysisNode,DashboardData} from '../src/core/types';
const q=new URLSearchParams(location.search),viz=(q.get('viz')||'bar') as GraphViz|WidgetType,mode=q.get('mode')||'canvas';
const metrics={orders:1000,otifRate:43,onTimeRate:61,volumeConformanceRate:57,dateCoverage:1000,volumeCoverage:1000,otifCoverage:1000,otifCases:430,onTimeCases:610,lateOrders:390,latePenaltyEur:1234567.89,shortfallPenaltyEur:234567.89,totalPenaltyEur:1469135.78,onTimeNotFullCases:180,lateInFullCases:140,lateNotFullCases:250,unclassifiedCases:0,orderedKg:500000,deliveredKg:490000,avgOrderedKg:500};
const ribbon={...metrics,avgDelayDays:3.2,affectedFactories:6,factories:6,deliveryDateCount:1000};
const rows=['Wuppertal','Crefeld','Duisburg','Bonn','Aachen','Essen','Ein sehr langer Segmentname zur Layoutprüfung'].map((label,i)=>({label,orders:100+i*20,otif_rate:34+i*4,on_time_rate:87.5-i*4.1,volume_rate:60+i,otif_cases:45,on_time_not_full_cases:20,late_in_full_cases:18,late_not_full_cases:17,unknown_cases:0,on_time_cases:65,late_orders:35,late_penalty_eur:123456.78*(i+1),shortfall_penalty_eur:3456.12*(i+1),total_penalty_eur:126912.9*(i+1),orderedKg:10000*(i+1),deliveredKg:9900*(i+1),avgOrderedKg:1000,date_coverage:100,customer_name:'Testkunde '+i,customer_country:'DE',customer_id_count:1}));
const trend=Array.from({length:12},(_,i)=>({month:'2018-'+String(i+1).padStart(2,'0'),orders:100+i*20,on_time_rate:62+i*2,values:{otifRate:30+i*2,totalPenaltyEur:i*12345,orderedKg:i*1000,deliveredKg:i*990}}));
const detail={metrics,ribbon,trend,breakdown:rows,pending:false,error:null} as DashboardData;
Object.assign(analysisApi,{segments:async()=>rows,breakdown:async()=>rows,metrics:async()=>metrics,trend:async()=>trend,heatmap:async()=>rows.flatMap(r=>['Crates','Pallets'].map(y=>({x:r.label,y,orders:r.orders,otif_rate:r.otif_rate,total_penalty_eur:r.total_penalty_eur}))),distribution:async()=>['0','1','2','3+'].map((bucket,i)=>({bucket,orders:200-i*35,otif_rate:50-i*5}))});
const no=()=>{};
function CanvasFixture(){
 const shared=['table','customer_table','comparison','status','scenario','bar_vertical','bullet','text','scatter'].includes(viz);
 const [w,setW]=useState(()=>shared?{...freshWidget(viz as WidgetType),id:'qa-widget'}:null);
 const [action,setAction]=useState('');
 const a:AnalysisNode={...(w?{canvasWidgetId:w.id,canvasWidgetType:w.type}:{}),id:'qa',kind:'metric',createdBy:'user',parentId:null,label:'Test · '+viz+' · langer Diagrammtitel',visualization:shared?'bar':viz as GraphViz,chartDimension:'factory',chartMetric:'totalPenaltyEur',metricId:'otifRate'};
 const n=nodeFor(a,{x:50,y:50});n.data={...n.data,orders:1000,onTimeRate:61,primaryValue:43,fullMetrics:metrics,appliedFilters:[],chartRows:rows,trendRows:trend,filterSummary:'Werk = Testwerk · Produkt = Crates',busy:false};
 const [nodes,setNodes,onNodesChange]=useNodesState<NNode>([n]),[edges,setEdges,onEdgesChange]=useEdgesState<NEdge>([]);const [selectedId,setSelectedId]=useState('qa');
 const size=cardDimensions(nodes[0].data.analysis);
 return <><output id="qa-action">{action}</output><output id="qa-display">{JSON.stringify(w?.display||{})}</output><output id="qa-size" data-width={size.width} data-height={size.height}>Canvas layout test</output><div style={{height:'calc(100vh - 32px)',display:'grid',minWidth:0}}><CanvasWithFlow dashboards={w?{qa:{question:'QA',widgets:[w]}}:{}} onUpdateWidget={(_n,_id,patch)=>setW(prev=>prev?{...prev,...patch}:prev)} onAreaFilter={(_n,f,v)=>setAction(f+':'+v)} onCreateBranch={(_n,f,v)=>setAction('branch:'+f+':'+v)} nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={no} globals={[]} locals={{}} onRemoveEdge={no} onSelect={setSelectedId} onSelectionClear={no} selectedId={selectedId} editMode={true} onEditToggle={no} onFilter={no} onSplit={no} onRemove={no} onConfigure={no} onExplain={no} onAdd={no} onSave={no} onReset={no} onGraphMove={no} onGraphStart={no} onResizeCard={(id,size)=>setNodes(ns=>resizeGraphCard(ns,id,size))} onToggleContainer={no} onUndo={no} onRedo={no} onViewportChange={no} fieldNames={FIELD_LABELS} fullscreen={false} setFullscreen={no} canEdit={true} dirty={false} onHelp={no}/></div></>;
}
function DashboardFixture(){
 const [d,setD]=useState<NodeDashboard>({question:'Layout test only',widgets:[{...freshWidget(viz as WidgetType),id:'qa-widget',title:'Langer Diagrammtitel zur Layoutprüfung',width:'full'}]});
 return <><output id="qa-size" data-width={d.widgets[0].width} data-height={d.widgets[0].displayHeight??0}>Dashboard layout test</output>{mode==='builder'?<DashboardBuilder nodeId="qa" nodeLabel="Test" nodeOptions={[{id:'qa',label:'Test'}]} onSelectNode={no} dashboard={d} onChange={setD} detail={detail} filters={[]} onBack={no} onSave={no} canEdit saving={false} fieldNames={FIELD_LABELS} allowedFields={CHART_SEGMENT_FIELDS}/>:<div style={{width:'min(100%, 1100px)',margin:'auto'}}><DashboardRenderer dashboard={d} detail={detail} filters={[]}/></div>}</>;
}
createRoot(document.getElementById('root')!).render(<ChartAccess.Provider value={{fields:[...CHART_SEGMENT_FIELDS,'cust_id','cust_name','order_received_date','promised_date']}}>{mode==='canvas'?<ReactFlowProvider><CanvasFixture/></ReactFlowProvider>:<DashboardFixture/>}</ChartAccess.Provider>);
