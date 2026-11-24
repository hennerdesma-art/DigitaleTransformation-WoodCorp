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
 assert.equal(next.edges.length,1);assert.equal(next.edges[0].target,group.id);assert.deepEqual(members.map(n=>n.data.analysis.visualization),['line','heatmap']);assert.notEqual(members[0].position.x,members[1].position.x);assert.equal(members[0].position.y,members[1].position.y);assert.equal(s.nodes.length,1);assert.equal(KNOWLEDGE_VERSION,'nxt-ai-v1.2');assert.match(MASTER_PLAYBOOK,/STANDARD WORKFLOW/);
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
