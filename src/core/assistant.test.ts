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
 assert.equal(next.edges.length,1);assert.equal(next.edges[0].target,group.id);assert.deepEqual(members.map(n=>n.data.analysis.visualization),['line','heatmap']);assert.notEqual(members[0].position.x,members[1].position.x);assert.equal(members[0].position.y,members[1].position.y);assert.equal(s.nodes.length,1);assert.equal(KNOWLEDGE_VERSION,'nxt-ai-v1.4.0');assert.match(MASTER_PLAYBOOK,/STANDARD WORKFLOW/);
});
test('standalone container inherits global, not anchor local filters; no visible links',()=>{
 const s=state();s.globals=[{id:'g',field:'delivery_year',op:'eq',value:'2018'}];s.locals.root=[{id:'f',field:'factory',op:'eq',value:'Essen'}];
 const plan={...PLAYBOOK_EXAMPLES.independent,operations:PLAYBOOK_EXAMPLES.independent.operations.map(o=>({...o,target:o.target==='example:root'?'root':o.target}))};const next=applyAssistantPlan(s,validatePlan(plan,['root'],s.allowedFields));const child=next.nodes.find(n=>n.data.analysis.visualization==='process_interval')!;
 assert.equal(next.edges.length,0);assert.equal(child.data.analysis.intervalKey,'shipment_to_delivery');assert.deepEqual(effectiveFilters(next.globals,next.nodes.map(n=>n.data.analysis),next.locals,child.id,next.edges).map(f=>f.value),['2018']);assert.deepEqual(s.nodes[0].position,{x:0,y:0});
});
test('canvas validator refuses unsupported or misleading chart encodings',()=>{
 const s=state();for(const patch of [{widgetType:'bar_horizontal'},{widgetType:'line',metric:'avgDelayDays'},{widgetType:'heatmap',dimension:'delivery_company'},{widgetType:'process_interval',value:'unknown'},{widgetType:'histogram',value:'lateness_days'},{widgetType:'pareto',dimension:'factory',metric:'orders'}])assert.throws(()=>validatePlan({answer:'x',operations:[action('add_branch','root',{ref:'new:a',label:'Chart',...patch})]},['root'],s.allowedFields));
 assert.throws(()=>validatePlan({answer:'x',operations:[action('add_branch','root',{ref:'new:a',label:'Chart',widgetType:'heatmap',dimension:'factory'})]},['root'],['factory']));
});

test('dashboard validator rejects false metric labels for fixed renderers',()=>{const s=state();for(const patch of [{widgetType:'line',metric:'avgDelayDays'},{widgetType:'donut',metric:'otifRate'},{widgetType:'pareto',metric:'orders'},{widgetType:'heatmap',metric:'onTimeRate'},{widgetType:'bar_vertical',metric:'avgDelayDays'}])assert.throws(()=>validatePlan({answer:'x',operations:[action('add_widget','root',{label:'Chart',...patch})]},['root'],s.allowedFields));});

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
 assert.equal(buildRequestBlocker('build_path',true,2)?.status,409);
 assert.equal(buildRequestBlocker('build_path',true,AI_GRAPH_FORMAT),null);
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

import {AI_PROMPT_LIMIT,AI_HISTORY_LIMIT,assistantPromptProblem,boundedAssistantHistory} from './assistantProtocol';
test('long analysis prompts retain all requested stages and reject excess instead of clipping',()=>{
 const long='Erstelle einen neuen Thinking Path. '+('Forschungsfrage, Ergebnisse und nächste Untersuchung. '.repeat(55))+' Abschließend Handlungsempfehlungen.';
 assert.ok(long.length>1600);assert.ok(long.length<AI_PROMPT_LIMIT);
 assert.equal(assistantPromptProblem(long),null);assert.equal(resolveAssistantIntent(long),'build_path');
 assert.equal(boundedAssistantHistory(long),long);
 assert.equal(assistantPromptProblem('x'.repeat(AI_PROMPT_LIMIT)),null);
 assert.match(assistantPromptProblem('x'.repeat(AI_PROMPT_LIMIT+1))||'',/nichts abgeschnitten/);
 assert.ok(assistantPromptProblem('  '));
 const clipped=boundedAssistantHistory('x'.repeat(AI_HISTORY_LIMIT+100));assert.ok(clipped.length<=AI_HISTORY_LIMIT);assert.match(clipped,/Älterer Chatkontext gekürzt/);
});

import {requiresGraph3,coordinatePair} from './assistantProtocol';
import {worldPosition,restoreDraft,containerSize} from './graph';
test('direct chart from container inherits context without membership; explicit independent chart uses global only',()=>{
 const s=state();s.globals=[{id:'g',field:'delivery_year',op:'eq',value:'2018'}];
 const next=applyAssistantPlan(s,{answer:'x',operations:[action('add_container','root',{label:'Group',ref:'new:g'}),action('add_filter','new:g',{field:'factory',value:'Essen'}),action('add_branch','new:g',{label:'In group',ref:'new:m',field:'member'}),action('add_branch','new:g',{label:'Direct',ref:'new:d',field:'direct',widgetType:'pareto',metric:'totalPenaltyEur',dimension:'product_type'}),action('add_branch','new:g',{label:'Independent',ref:'new:i',field:'standalone',widgetType:'line',metric:'onTimeRate'})]});
 const get=(label:string)=>next.nodes.find(n=>n.data.analysis.label===label)!;
 assert.equal(get('In group').data.analysis.containerId,get('Group').id);
 assert.equal(get('Direct').data.analysis.containerId,undefined);assert.equal(get('Independent').data.analysis.containerId,undefined);
 assert.ok(next.edges.some(e=>e.source===get('Group').id&&e.target===get('Direct').id));assert.ok(!next.edges.some(e=>e.target===get('Independent').id));
 const filters=(id:string)=>effectiveFilters(next.globals,next.nodes.map(n=>n.data.analysis),next.locals,id,next.edges).map(f=>f.value);
 assert.deepEqual(filters(get('Direct').id),['2018','Essen']);assert.deepEqual(filters(get('Independent').id),['2018']);
});
test('layout edits move group and arrange members without changing filter graph or original positions; style persists',()=>{
 const s=state();const initial=applyAssistantPlan(s,{answer:'x',operations:[action('add_container','root',{label:'G',ref:'new:g'}),action('add_filter','new:g',{field:'factory',value:'Essen'}),action('add_branch','new:g',{label:'A',ref:'new:a'}),action('add_branch','new:g',{label:'B',ref:'new:b'})]});
 const group=initial.nodes.find(n=>n.data.analysis.label==='G')!,a=initial.nodes.find(n=>n.data.analysis.label==='A')!,b=initial.nodes.find(n=>n.data.analysis.label==='B')!;
 const snapshot=JSON.stringify(initial);
 const next=applyAssistantPlan(initial,{answer:'x',operations:[action('arrange_container',group.id,{value:'1'}),action('move_node',group.id,{value:'1000,1000'}),action('set_container_style',group.id,{value:'sand'}),action('resize_container',group.id,{value:'800,900'})]});
 const g=next.nodes.find(n=>n.id===group.id)!,m=next.nodes.find(n=>n.id===a.id)!,m2=next.nodes.find(n=>n.id===b.id)!;
 assert.equal(JSON.stringify(initial),snapshot);assert.equal(g.data.analysis.containerTone,'sand');assert.deepEqual(g.position,{x:1000,y:1000});
 assert.equal(m.position.x,m2.position.x);assert.ok(m2.position.y>m.position.y);
 assert.deepEqual(worldPosition(m,next.nodes),{x:1018,y:1086});assert.deepEqual(containerSize(g.data.analysis),{width:800,height:900});
 assert.deepEqual(next.edges,initial.edges);assert.deepEqual(next.locals,initial.locals);assert.deepEqual(next.dashboards,initial.dashboards);
 const restored=restoreDraft(serializeDraft(next.nodes,next.edges,next.locals,{x:0,y:0,zoom:1}));assert.equal(restored.nodes.find(n=>n.id===g.id)?.data.analysis.containerTone,'sand');assert.deepEqual(restored.nodes.find(n=>n.id===g.id)?.position,g.position);
 const ctx=contextForAssistant(next,null,true);assert.deepEqual(ctx.nodes.find(n=>n.id===g.id)?.position,g.position);assert.equal(ctx.nodes.find(n=>n.id===g.id)?.containerTone,'sand');
});
test('pure moves and chart edits are bounded and collision-safe, cannot bypass role or target restrictions',()=>{
 const s=state();const initial=applyAssistantPlan(s,{answer:'x',operations:[action('add_branch','root',{label:'A',ref:'new:a',field:'direct'})]});
 const a=initial.nodes.find(n=>n.data.analysis.label==='A')!;
 assert.throws(()=>applyAssistantPlan(initial,{answer:'x',operations:[action('move_node',a.id,{value:'0,0'})]}),/überlappen/);
 for(const patch of ['NaN,3','100001,0','0.5,2'])assert.equal(coordinatePair(patch,-100000,100000,-100000,100000),null);
 assert.throws(()=>applyAssistantPlan(initial,{answer:'x',operations:[action('set_container_style',a.id,{value:'sand'})]}),/Container/);
 assert.throws(()=>validatePlan({answer:'x',operations:[action('set_container_style','root',{value:'#ff0000'})]},['root'],s.allowedFields));
 assert.throws(()=>validatePlan({answer:'x',operations:[action('move_node','root',{value:'5,5'})]},['root'],s.allowedFields,false),/lesbar/);
 assert.throws(()=>applyAssistantPlan(s,{answer:'x',operations:[action('add_branch','root',{label:'A',ref:'new:a',field:'member'})]}),/Container/);
 const next=applyAssistantPlan(initial,{answer:'x',operations:[action('move_node',a.id,{value:'1000,1000'}),action('set_node_visualization',a.id,{widgetType:'pareto',metric:'totalPenaltyEur',dimension:'factory'})]});
 assert.equal(next.nodes.find(n=>n.id===a.id)?.data.analysis.visualization,'pareto');assert.deepEqual(next.edges,initial.edges);assert.deepEqual(next.locals,initial.locals);assert.deepEqual(next.dashboards,initial.dashboards);
 assert.equal(requiresGraph3(action('move_node','root',{value:'0,0'})),true);
 assert.equal(resolveAssistantIntent('Verschiebe den Container nach rechts'),'edit_layout');
 assert.equal(resolveAssistantIntent('Ändere die Farbe des Containers'),'edit_layout');
 assert.equal(resolveAssistantIntent('Wie kann ich den Container verschieben?'),'auto');
 assert.ok(buildPlanProblem('edit_layout',{answer:'x',operations:[]}));
 assert.equal(buildPlanProblem('edit_layout',{answer:'x',operations:[action('move_node','root',{value:'1,1'})]}),null);
});
test('playbook direct chart example is executable without a container',()=>{
 const s=state();const p={...PLAYBOOK_EXAMPLES.direct,operations:PLAYBOOK_EXAMPLES.direct.operations.map(o=>({...o,target:o.target==='example:root'?'root':o.target}))};
 const next=applyAssistantPlan(s,validatePlan(p,['root'],s.allowedFields));assert.equal(next.nodes.filter(n=>n.data.analysis.kind==='container').length,0);assert.equal(next.edges.length,1);assert.equal(next.nodes[1].data.analysis.visualization,'pareto');
});

test('AI creates standalone findings and references without inheriting source filters',()=>{const s=state();s.locals.root=[{id:'f',field:'factory',op:'eq',value:'Essen'}];const next=applyAssistantPlan(s,{answer:'x',operations:[action('add_finding','root',{ref:'new:doc',label:'Befund',value:'Hypothese prüfen. Noch nicht bestätigt.'}),action('add_branch','root',{ref:'new:control',label:'Kontrolle',field:'standalone'}),action('add_reference','new:doc',{value:'new:control'})]});const note=next.nodes.find(n=>n.data.analysis.kind==='note')!;assert.equal(note.data.analysis.finding?.sourceId,'root');assert.equal(next.edges.filter(e=>e.data?.kind==='annotation').length,2);assert.equal(effectiveFilters([],next.nodes.map(n=>n.data.analysis),next.locals,note.id,next.edges).length,0);assert.equal(s.nodes.length,1)});
test('AI supports new aggregate metrics and typed numeric filters',()=>{const s=state();s.allowedFields.push('production_days','quantity_change_group');const next=applyAssistantPlan(s,{answer:'x',operations:[action('add_filter','root',{field:'production_days',widgetType:'between',value:'["0","20"]'}),action('add_widget','root',{widgetType:'bar_vertical',label:'Mengenabweichung',metric:'underDeliveryRate',dimension:'quantity_change_group'}),action('add_widget','root',{widgetType:'line',label:'Kosten pro kg',metric:'penaltyPerKgEur'})]});assert.deepEqual(next.locals.root[0].value,['0','20']);assert.equal(next.dashboards.root.widgets[0].metric,'underDeliveryRate');assert.equal(next.dashboards.root.widgets[1].metric,'penaltyPerKgEur');assert.throws(()=>validatePlan({answer:'x',operations:[action('add_filter','root',{field:'production_days',widgetType:'between',value:'["20","0"]'})]},['root'],s.allowedFields));});
