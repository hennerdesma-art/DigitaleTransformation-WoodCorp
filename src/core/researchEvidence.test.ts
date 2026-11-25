
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {researchRequest,sanitizeResearch,plannedResearchChecks,suggestedResearch,evidenceSummary} from '../../supabase/functions/nxt-intelligence/researchEvidence';
import {action,parseAiResearch} from './assistantProtocol';
test('edge and browser share exactly the same validation contract',()=>assert.equal(readFileSync('src/core/assistantProtocol.ts','utf8'),readFileSync('supabase/functions/nxt-intelligence/protocol.ts','utf8')));
test('aggregate sanitizer never returns raw rows, customer IDs or small-group records',()=>{
 assert.equal(researchRequest({tab:'cases'}),null);assert.equal(researchRequest({tab:'groups',dimensions:['cust_id']}),null);
 const e=sanitizeResearch({baseline:{orders:100,total_cost:30,otif_ok:20,otif_n:100,on_time_n:60,date_n:100,cust_name:'PRIVATE'},rows:[{orders:8,labels:['Crates'],cust_name:'PRIVATE',case_key:'SECRET'},{orders:3,labels:['RARE']}]},{tab:'groups',dimensions:['product_type']});
 assert.equal(e.status,'available');assert.ok(!/PRIVATE|SECRET|RARE/.test(JSON.stringify(e)));
});
test('planned check uses exact inherited filters and ignores annotation links',()=>{
 const g={field:'delivery_year',op:'eq',value:'2018'},f={field:'factory',op:'eq',value:'Essen'};
 const ctx={selectedId:'a',nodes:[{id:'r',localFilters:[]},{id:'g',localFilters:[f]},{id:'a',containerId:'g',localFilters:[]},{id:'b',localFilters:[{field:'product_type',op:'eq',value:'Pallets'}]}],edges:[{source:'r',target:'g'},{source:'b',target:'a',kind:'annotation'}],globalFilters:[g],filters:[g,f]};
 const ops=[action('add_branch','a',{ref:'new:x',label:'x',widgetType:'research',value:'{"tab":"groups","dimensions":["factory"]}'}),action('add_filter','new:x',{field:'product_type',value:'Crates'}),action('add_branch','a',{ref:'new:y',label:'y',field:'standalone',widgetType:'research',value:'{"tab":"quality"}'})];
 const checks=plannedResearchChecks(ctx,ops,v=>parseAiResearch(v,['factory','product_type','delivery_year']) as any);
 assert.deepEqual(checks[0].filters.map(f=>f.value),['2018','Essen','Crates']);assert.deepEqual(checks[1].filters.map(f=>f.value),['2018']);
 assert.equal(plannedResearchChecks({...ctx,filters:[g]},ops,v=>parseAiResearch(v,['factory']) as any).length,0);
});
test('quantity change control comparison uses actual known category values and safe dimensions',()=>{const requests=suggestedResearch('Mengenänderungen mit 3+ Änderungen und Mengenkonformität',['quantity_change_group','factory','product_type'],[],{quantity_change_group:[{label:'0'},{label:'3+'}]});assert.equal(requests[0].tab,'compare');assert.equal(requests[0].b,'3+');assert.equal(requests[0].outcome,'volume');});
