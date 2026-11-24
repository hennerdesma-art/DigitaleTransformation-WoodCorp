import test from 'node:test';import assert from 'node:assert/strict';
import {nodeFor,serializeDraft} from './graph';import {effectiveFilters} from './filters';import {applyAssistantPlan,assistantFingerprint,contextForAssistant,localAssistantPlan,type AssistantState} from './assistant';import {action,validatePlan} from './assistantProtocol';
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
