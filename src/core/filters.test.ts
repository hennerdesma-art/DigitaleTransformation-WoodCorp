import test from 'node:test';import assert from 'node:assert/strict';
import {effectiveFilters,validateFilters,filterSignature,conflictingFields} from './filters';import type {AnalysisNode,Filter} from './types';
const f=(field:Filter['field'],value:string):Filter=>({id:field+value,field,op:'eq',value});
const nodes:AnalysisNode[]=[{id:'r',parentId:null,label:'Root',kind:'root',createdBy:'system'},{id:'a',parentId:'r',label:'A',kind:'segment',createdBy:'system',predicate:f('factory','Essen')},{id:'b',parentId:'r',label:'B',kind:'segment',createdBy:'system',predicate:f('factory','Bonn')},{id:'c',parentId:'a',label:'Child',kind:'segment',createdBy:'system',predicate:f('delivery_company','Carrier A')}];
test('legacy parentId inheritance continues to work',()=>{assert.equal(effectiveFilters([f('delivery_year','2018')],nodes,{},'a').length,2);assert.equal(effectiveFilters([f('delivery_year','2018')],nodes,{},'b').length,2);});
test('node-local filter inherited by descendant, never sibling',()=>{const l={a:[f('product_type','Crates')]};assert.equal(effectiveFilters([],nodes,l,'c').length,3);assert.equal(effectiveFilters([],nodes,l,'b').length,1);});
test('duplicate and unknown fields rejected',()=>{assert.throws(()=>validateFilters([f('factory','Bonn'),f('factory','Bonn')]));assert.throws(()=>validateFilters([{...f('factory','Bonn'),field:'DROP TABLE' as Filter['field']}]));});
test('signatures insensitive to filter order',()=>{assert.equal(filterSignature([f('factory','Essen'),f('delivery_year','2018')]),filterSignature([f('delivery_year','2018'),f('factory','Essen')]));});
test('legacy parent cycle rejected',()=>{assert.throws(()=>effectiveFilters([],[{...nodes[0],parentId:'c'},...nodes.slice(1)],{},'c'));});
test('all directed links propagate filters regardless of visual/analytic type',()=>{
 const links=[{source:'r',target:'a'},{source:'a',target:'c'},{source:'b',target:'c'}];
 const result=effectiveFilters([f('delivery_year','2018')],nodes,{r:[f('product_type','Pallets')]},'c',links);
 assert.ok(result.some(x=>x.field==='product_type'&&x.value==='Pallets'));
 assert.ok(result.some(x=>x.field==='factory'&&x.value==='Essen'));
 assert.ok(result.some(x=>x.field==='factory'&&x.value==='Bonn'));
 assert.deepEqual(conflictingFields(result),['factory']);
});
test('disconnected children do not silently inherit parentId when links supplied',()=>{
 const result=effectiveFilters([],nodes,{r:[f('delivery_year','2019')]},'a',[]);
 assert.equal(result.some(x=>x.field==='delivery_year'),false);
});
test('cycles in old saved graphs are reported',()=>{assert.throws(()=>effectiveFilters([],nodes,{},'a',[{source:'a',target:'b'},{source:'b',target:'a'}]),/Filterkreis/);});
test('filter removal and upstream changes affect only reachable descendants',()=>{
 const base=[{source:'r',target:'a'},{source:'r',target:'b'},{source:'a',target:'c'}];
 const locals={a:[f('product_type','Crates')]};
 assert.equal(effectiveFilters([],nodes,locals,'c',base).some(x=>x.field==='product_type'),true);
 assert.equal(effectiveFilters([],nodes,locals,'b',base).some(x=>x.field==='product_type'),false);
 assert.equal(effectiveFilters([],nodes,locals,'c',base.slice(0,2)).some(x=>x.field==='product_type'),false);
});
test('new verified WoodCorp dimensions stay exact-match filters',()=>{
 const registered={id:'market',field:'cust_market' as const,op:'eq' as const,value:'Retail'};
 assert.equal(validateFilters([registered])[0].field,'cust_market');
});

test('typed date, numeric and multiselect filters are validated',()=>{
 assert.equal(validateFilters([{id:'date',field:'delivered_date',op:'between',value:['2018-01-01','2018-12-31']}])[0].op,'between');
 assert.equal(validateFilters([{id:'num',field:'quantity_change_count',op:'gte',value:'3'}])[0].op,'gte');
 assert.equal(validateFilters([{id:'multi',field:'factory',op:'in',value:['Essen','Bonn']}])[0].op,'in');
 assert.throws(()=>validateFilters([{id:'bad',field:'factory',op:'between',value:['A','B']}]),/Kategorie/);
 assert.throws(()=>validateFilters([{id:'date',field:'delivered_date',op:'between',value:['2019-01-01','2018-01-01']}]),/Von-Wert/);
});
test('conflicting ranges and multi-select intersections are recognized',()=>{
 assert.deepEqual(conflictingFields([
  {id:'global',field:'quantity_change_count',op:'gte',value:'3'},
  {id:'node',field:'quantity_change_count',op:'lte',value:'1'}
 ]),['quantity_change_count']);
 assert.deepEqual(conflictingFields([
  {id:'global',field:'factory',op:'in',value:['Essen','Bonn']},
  {id:'node',field:'factory',op:'eq',value:'Crates'}
 ]),['factory']);
 assert.deepEqual(conflictingFields([
  {id:'global',field:'factory',op:'in',value:['Essen','Bonn']},
  {id:'node',field:'factory',op:'eq',value:'Bonn'}
 ]),[]);
});
