import test from 'node:test';import assert from 'node:assert/strict';import {effectiveFilters,validateFilters,filterSignature} from './filters';import type {AnalysisNode,Filter} from './types';
const f=(field:Filter['field'],value:string):Filter=>({id:field+value,field,op:'eq',value});
const nodes:AnalysisNode[]=[{id:'r',parentId:null,label:'Root',kind:'root',createdBy:'system'},{id:'a',parentId:'r',label:'A',kind:'segment',createdBy:'system',predicate:f('factory','Essen')},{id:'b',parentId:'r',label:'B',kind:'segment',createdBy:'system',predicate:f('factory','Bonn')},{id:'c',parentId:'a',label:'Child',kind:'segment',createdBy:'system',predicate:f('delivery_company','Carrier A')}];
test('global filters reach both branches',()=>{assert.equal(effectiveFilters([f('delivery_year','2018')],nodes,{},'a').length,2);assert.equal(effectiveFilters([f('delivery_year','2018')],nodes,{},'b').length,2);});
test('node filter inherits only into descendant',()=>{const l={a:[f('product_type','Crates')]};assert.equal(effectiveFilters([],nodes,l,'c').length,3);assert.equal(effectiveFilters([],nodes,l,'b').length,1);});
test('duplicate and unknown fields are rejected',()=>{assert.throws(()=>validateFilters([f('factory','Bonn'),f('factory','Bonn')]));assert.throws(()=>validateFilters([{...f('factory','Bonn'),field:'drop table' as Filter['field']}]));});
test('filter signature unaffected by order',()=>{assert.equal(filterSignature([f('factory','Essen'),f('delivery_year','2018')]),filterSignature([f('delivery_year','2018'),f('factory','Essen')]));});
test('cycles are rejected',()=>{assert.throws(()=>effectiveFilters([],[{...nodes[0],parentId:'c'},...nodes.slice(1)],{},'c'));});

test('new verified WoodCorp dimensions remain exact-match case filters',()=>{
 const registered={id:'market',field:'cust_market' as const,op:'eq' as const,value:'Retail'};
 assert.equal(validateFilters([registered])[0].field,'cust_market');
 const local={a:[registered]};
 const result=effectiveFilters([],nodes,local,'a');
 assert.equal(result.find(x=>x.field==='cust_market')?.value,'Retail');
 assert.equal(effectiveFilters([],nodes,local,'b').some(x=>x.field==='cust_market'),false);
});
