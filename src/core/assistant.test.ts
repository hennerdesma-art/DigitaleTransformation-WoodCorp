import test from 'node:test';import assert from 'node:assert/strict';
import {nodeFor,serializeDraft} from './graph';import {effectiveFilters} from './filters';import {applyAssistantPlan,assistantFingerprint,contextForAssistant,localAssistantPlan,resolveAssistantNodeId,type AssistantState} from './assistant';import {action,validatePlan} from './assistantProtocol';
const state=():AssistantState=>({nodes:[nodeFor({id:'root',parentId:null,label:'Root',kind:'root',createdBy:'user',metricId:'otifRate'},{x:0,y:0})],edges:[],globals:[],locals:{},dashboards:{root:{question:'',widgets:[]}},selectedId:'root',allowedFields:['factory','product_type','delivery_company','delivery_year']});
test('proposals are read-only until applied and preserve separate siblings',()=>{
 const s=state(),plan={answer:'Vorschlag',operations:[action('add_container','root',{ref:'new:g',label:'Gruppe'}),action('add_branch','new:g',{ref:'new:a',label:'Werk A'}),action('add_branch','new:g',{ref:'new:b',label:'Werk B'}),action('add_filter','new:g',{field:'product_type',value:'Crates'}),action('add_filter','new:a',{field:'factory',value:'Essen'}),action('add_filter','new:b',{field:'factory',value:'Aachen'})]};
 const next=applyAssistantPlan(s,plan);
 assert.equal(s.nodes.length,1);assert.equal(next.nodes.length,4);assert.equal(next.edges.length,1);
 for(const [label,value] of [['Werk A','Essen'],['Werk B','Aachen']]){const n=next.nodes.find(x=>x.data.analysis.label===label)!;assert.deepEqual(effectiveFilters([],next.nodes.map(x=>x.data.analysis),next.locals,n.id,next.edges).map(f=>f.value),['Crates',value])}
});
test('malformed or unauthorized operations cannot apply',()=>{
 const s=state();
 assert.throws(()=>validatePlan({answer:'x',operations:[action('rename_node','unknown',{label:'x'})]},['root'],s.allowedFields));
 assert.throws(()=>validatePlan({answer:'x',operations:[action('rename_node','root',{label:'x'})]},['root'],s.allowedFields,false),/lesbar/);
 assert.throws(()=>applyAssistantPlan(s,{answer:'x',operations:[action('add_filter','root',{field:'cust_addr_code',value:'x'})]}));
 assert.throws(()=>applyAssistantPlan(s,{answer:'x',operations:[action('add_widget','root',{widgetType:'bullet',label:'Ziel'})]}));
});
test('invalid downstream filters reject whole proposal',()=>{
 const s=state();s.globals=[{id:'global',field:'factory',op:'eq',value:'Essen'}];
 assert.throws(()=>applyAssistantPlan(s,{answer:'x',operations:[action('add_filter','root',{field:'factory',value:'Aachen'})]}),/Filterkonflikt/);
 assert.deepEqual(s.locals,{});
});
test('local path creates live workspace-compatible structure without AI calls',()=>{
 const s=state(),p=localAssistantPlan('Analysepfad',s,null,true,'path'),next=applyAssistantPlan(s,p);
 assert.ok(next.nodes.some(n=>n.data.analysis.kind==='container'));assert.ok(next.nodes.length>3);
 assert.ok(serializeDraft(next.nodes,next.edges,next.locals,{x:0,y:0,zoom:1}).nodes.length>3);
});
test('fingerprint detects selection, local filters, layout and revision changes',()=>{
 const s=state(),one=assistantFingerprint(s,'w',1);
 assert.notEqual(one,assistantFingerprint(s,'w',2));assert.notEqual(one,assistantFingerprint({...s,locals:{root:[{id:'f',field:'factory',op:'eq',value:'Essen'}]}},'w',1));
 assert.equal(contextForAssistant(s,{id:'w',title:'WoodCorp',revision:1},true).workspaceTitle,'WoodCorp');
});

test('generated local root is selected when old root ID is missing',()=>{const s=state();assert.equal(resolveAssistantNodeId(s.nodes,'root:otd'),'root');assert.equal(resolveAssistantNodeId([], 'root'),'')});
test('new dashboard proposal replaces selected widgets only and includes real chart types',()=>{const s=state();const p=localAssistantPlan('Neu',s,null,true,'new_dashboard');const next=applyAssistantPlan(s,p);assert.ok(next.dashboards.root.widgets.length>=7);assert.ok(next.dashboards.root.widgets.some(w=>w.type==='e02_compare'));assert.equal(s.dashboards.root.widgets.length,0);});

test('assistant context contains each branch local filters and global filters',()=>{const s=state();s.globals=[{id:'g',field:'delivery_year',op:'eq',value:'2018'}];s.locals.root=[{id:'f',field:'factory',op:'eq',value:'Essen'}];const c=contextForAssistant(s,null,true);assert.equal(c.globalFilters[0].value,'2018');assert.equal(c.nodes[0].localFilters[0].value,'Essen');assert.equal(c.filters.length,2)});

import {PLAYBOOK_EXAMPLES,MASTER_PLAYBOOK} from '../../supabase/functions/nxt-intelligence/knowledge';
import {KNOWLEDGE_VERSION} from './assistantProtocol';
test('live prompt examples execute as one connected group and separate canvas charts',()=>{
 const s=state();const plan={...PLAYBOOK_EXAMPLES.grouped,operations:PLAYBOOK_EXAMPLES.grouped.operations.map(o=>({...o,target:o.target==='example:root'?'root':o.target}))};
 const next=applyAssistantPlan(s,validatePlan(plan,['root'],s.allowedFields));const group=next.nodes.find(n=>n.data.analysis.kind==='container')!;const members=next.nodes.filter(n=>n.data.analysis.containerId===group.id);
 assert.equal(next.edges.length,1);assert.equal(next.edges[0].target,group.id);assert.deepEqual(members.map(n=>n.data.analysis.visualization),['line','heatmap']);assert.notEqual(members[0].position.x,members[1].position.x);assert.equal(members[0].position.y,members[1].position.y);assert.equal(s.nodes.length,1);assert.equal(KNOWLEDGE_VERSION,'nxt-ai-v1.2.2');assert.match(MASTER_PLAYBOOK,/STANDARD WORKFLOW/);
});
test('standalone container inherits global, not anchor local filters; no visible links',()=>{
 const s=state();s.globals=[{id:'g',field:'delivery_year',op:'eq',value:'2018'}];s.locals.root=[{id:'f',field:'factory',op:'eq',value:'Essen'}];
 const plan={...PLAYBOOK_EXAMPLES.independent,operations:PLAYBOOK_EXAMPLES.independent.operations.map(o=>({...o,target:o.target==='example:root'?'root':o.target}))};const next=applyAssistantPlan(s,validatePlan(plan,['root'],s.allowedFields));const child=next.nodes.find(n=>n.data.analysis.visualization==='process_interval')!;
 assert.equal(next.edges.length,0);assert.equal(child.data.analysis.intervalKey,'shipment_to_delivery');assert.deepEqual(effectiveFilters(next.globals,next.nodes.map(n=>n.data.analysis),next.locals,child.id,next.edges).map(f=>f.value),['2018']);assert.deepEqual(s.nodes[0].position,{x:0,y:0});
});
test('canvas validator refuses unsupported or misleading chart encodings',()=>{
 const s=state();for(const patch of [{widgetType:'bar_horizontal'},{widgetType:'line',metric:'otifRate'},{widgetType:'heatmap',dimension:'delivery_company'},{widgetType:'process_interval',value:'unknown'},{widgetType:'histogram',value:'lateness_days'},{widgetType:'pareto',dimension:'factory',metric:'orders'}])assert.throws(()=>validatePlan({answer:'x',operations:[action('add_branch','root',{ref:'new:a',label:'Chart',...patch})]},['root'],s.allowedFields));
 assert.throws(()=>validatePlan({answer:'x',operations:[action('add_branch','root',{ref:'new:a',label:'Chart',widgetType:'heatmap',dimension:'factory'})]},['root'],['factory']));
});

test('dashboard validator rejects false metric labels for fixed renderers',()=>{const s=state();for(const patch of [{widgetType:'line',metric:'otifRate'},{widgetType:'donut',metric:'otifRate'},{widgetType:'pareto',metric:'orders'},{widgetType:'heatmap',metric:'onTimeRate'},{widgetType:'bar_vertical',metric:'avgDelayDays'}])assert.throws(()=>validatePlan({answer:'x',operations:[action('add_widget','root',{label:'Chart',...patch})]},['root'],s.allowedFields));});

import {resolveAssistantIntent,buildRequestBlocker,buildPlanProblem,AI_GRAPH_FORMAT} from './assistantProtocol';
const reportedRequest='Erstelle einen vollständigen Thinking Path zur Identifikation möglicher Ursachen unserer OTIF-Performance. Beginne mit einer Executive-Übersicht, bündele zusammengehörige Visualisierungen in Containern und erstelle für jeden relevanten Analysezweig ein eigenes Dashboard mit Forschungsfrage, passenden Kennzahlen, Datenqualitätsprüfung und weiterführender Hypothese. Nutze ausschließlich verfügbare Daten und unterstützte Diagrammtypen.';
test('reported explicit Thinking Path request must be build, not orientation',()=>{
 assert.equal(resolveAssistantIntent(reportedRequest),'build_path');
 assert.equal(resolveAssistantIntent('Erstelle ein vollständiges Dashboard'),'build_dashboard');
 assert.equal(resolveAssistantIntent('Wie erstelle ich einen Thinking Path?'),'auto');
 assert.equal(resolveAssistantIntent('Erkläre den vorhandenen Thinking Path'),'auto');
 assert.equal(resolveAssistantIntent('Create a new dashboard'),'build_dashboard');
 assert.equal(resolveAssistantIntent('Bitte erstelle einen Analysepfad'),'build_path');
 assert.equal(resolveAssistantIntent('Ich möchte einen Thinking Path erstellen'),'build_path');
 assert.equal(resolveAssistantIntent('Vorschlag','build_path'),'build_path');
 assert.equal(contextForAssistant(state(),null,true).graphFormat,AI_GRAPH_FORMAT);
});
test('explicit build preflight rejects readonly or outdated graph before provider reservation',()=>{
 assert.equal(buildRequestBlocker('build_path',false,2)?.status,403);
 assert.equal(buildRequestBlocker('build_path',true,1)?.status,409);
 assert.equal(buildRequestBlocker('build_dashboard',true,undefined)?.status,409);
 assert.equal(buildRequestBlocker('build_path',true,2),null);
 assert.equal(buildRequestBlocker('auto',false,1),null);
});
test('reported empty plan cannot be a successful build response even for populated graph',()=>{
 const noOp={answer:'Der vorhandene Graph ist vollständig. Keine Operationen erforderlich.',operations:[]};
 assert.ok(buildPlanProblem('build_path',noOp));
 assert.ok(buildPlanProblem('build_dashboard',noOp));
 assert.equal(buildPlanProblem('auto',noOp),null);
 const path={answer:'Vorschlag',operations:[action('add_container','root',{label:'Neue Hypothesen',ref:'new:g'}),action('add_branch','new:g',{label:'Alternativer Test',ref:'new:b'}),action('add_widget','new:b',{label:'Auftragsanzahl',widgetType:'kpi',metric:'orders'})]};
 assert.equal(buildPlanProblem('build_path',path),null);
 const existing=applyAssistantPlan(state(),localAssistantPlan('Analysepfad',state(),null,true,'path'));
 assert.ok(existing.nodes.length>3);
 assert.ok(buildPlanProblem(resolveAssistantIntent(reportedRequest),noOp));
 assert.equal(buildPlanProblem('build_path',{answer:'x',operations:[action('set_question','root',{label:'Neue Frage'})]})!==null,true);
});

test('a second container is a top-level downstream group, not a nested layout child',()=>{
 const s=state();s.globals=[{id:'g',field:'delivery_year',op:'eq',value:'2018'}];
 const initial=applyAssistantPlan(s,{answer:'Initial',operations:[action('add_container','root',{ref:'new:g',label:'Gruppe A'}),action('add_filter','new:g',{field:'product_type',value:'Crates'}),action('add_branch','new:g',{ref:'new:old',label:'Werk A'}),action('add_filter','new:old',{field:'factory',value:'Essen'})]});
 const group=initial.nodes.find(n=>n.data.analysis.label==='Gruppe A')!,old=initial.nodes.find(n=>n.data.analysis.label==='Werk A')!;
 const plan={answer:'Weiterführend',operations:[action('add_container',group.id,{ref:'new:cost',label:'Kostentreiber'}),action('add_branch','new:cost',{ref:'new:carrier',label:'Kosten nach Lieferunternehmen',widgetType:'pareto',metric:'totalPenaltyEur',dimension:'delivery_company'}),action('add_container','new:cost',{ref:'new:deeper',label:'Vertiefung'}),action('add_branch','new:deeper',{ref:'new:product',label:'Kosten nach Produkt',metric:'totalPenaltyEur'})]};
 const next=applyAssistantPlan(initial,plan);
 const cost=next.nodes.find(n=>n.data.analysis.label==='Kostentreiber')!,deeper=next.nodes.find(n=>n.data.analysis.label==='Vertiefung')!,child=next.nodes.find(n=>n.data.analysis.label==='Kosten nach Produkt')!;
 for(const g of [cost,deeper]){assert.equal(g.data.analysis.containerId,undefined);assert.equal(g.parentId,undefined);}
 assert.ok(next.edges.some(e=>e.source===group.id&&e.target===cost.id));assert.ok(next.edges.some(e=>e.source===cost.id&&e.target===deeper.id));
 assert.deepEqual(effectiveFilters(next.globals,next.nodes.map(n=>n.data.analysis),next.locals,child.id,next.edges).map(f=>f.value),['2018','Crates']);
 assert.deepEqual(effectiveFilters(next.globals,next.nodes.map(n=>n.data.analysis),next.locals,old.id,next.edges).map(f=>f.value),['2018','Crates','Essen']);
 assert.equal(initial.nodes.length,3);
});
test('downstream group from member retains private member filters',()=>{
 const s=state();const next=applyAssistantPlan(s,{answer:'x',operations:[action('add_container','root',{ref:'new:g',label:'A'}),action('add_branch','new:g',{ref:'new:member',label:'Member'}),action('add_filter','new:member',{field:'factory',value:'Essen'}),action('add_container','new:member',{ref:'new:cost',label:'B'}),action('add_branch','new:cost',{ref:'new:b',label:'B member'})]});
 const member=next.nodes.find(n=>n.data.analysis.label==='Member')!,group=next.nodes.find(n=>n.data.analysis.label==='B')!,b=next.nodes.find(n=>n.data.analysis.label==='B member')!;
 assert.equal(group.data.analysis.containerId,undefined);assert.ok(next.edges.some(e=>e.source===member.id&&e.target===group.id));
 assert.deepEqual(effectiveFilters([],next.nodes.map(n=>n.data.analysis),next.locals,b.id,next.edges).map(f=>f.value),['Essen']);
});
test('reported extension request is an explicit build_path intent',()=>{assert.equal(resolveAssistantIntent('kannst du eine weitere analyse tätigen und den thinking path weiter ausbauen. ich möchte wissen was der größte treiber der unkosten der vertragsstrafen sind.'),'build_path');assert.equal(resolveAssistantIntent('Wie kann ich den Thinking Path weiter ausbauen?'),'auto');});
