import test from 'node:test';import assert from 'node:assert/strict';
import {costDriverCombinations,isCostDrilldown} from '../../supabase/functions/nxt-intelligence/costEvidence';
test('cost drilldown ranks actual combined cells with the original filters',async()=>{
 const products=[{label:'P1',orders:20,total_penalty_eur:1000},{label:'P2',orders:30,total_penalty_eur:1500}];
 const original=[{field:'delivery_year',op:'eq',value:'2018'}];let calls=0;
 const result=await costDriverCombinations(products,original,50,async filters=>{calls++;assert.deepEqual(filters[0],original[0]);const p=filters[1].value;return p==='P1'?[{x:'A',y:'X',orders:20,total_penalty_eur:1000,otif_rate:30}]:[{x:'A',y:'X',orders:15,total_penalty_eur:700,otif_rate:40},{x:'B',y:'Y',orders:15,total_penalty_eur:800,otif_rate:50}];});
 assert.equal(calls,2);assert.equal(result.allEligibleGroupsCovered,true);assert.equal(result.combinations?.[0].product_type,'P1');assert.equal(result.combinations?.[0].total_penalty_eur,1000);assert.equal(original.length,1);assert.equal(isCostDrilldown('Unkosten der Vertragsstrafen'),'true'==='true');
});
test('inherited product filter is not duplicated; small and missing cells are suppressed',async()=>{
 const original=[{field:'product_type',op:'eq',value:'P1'}];
 const result=await costDriverCombinations([{label:'P1',orders:20,total_penalty_eur:1000}],original,20,async filters=>{assert.deepEqual(filters,original);return [{x:'A',y:'X',orders:18,total_penalty_eur:900},{x:'B',y:'Y',orders:2,total_penalty_eur:100}];});
 assert.equal(result.allEligibleGroupsCovered,false);assert.equal(result.combinations?.length,1);assert.equal(result.combinations?.[0].orders,18);
});
test('unavailable aggregates, failed RPC, and maximum filter count fail closed',async()=>{
 const products=[{label:'P',orders:10,total_penalty_eur:100}];let calls=0;
 const blocked=await costDriverCombinations(products,Array.from({length:12},()=>({field:'factory',op:'eq',value:'A'})),10,async()=>{calls++;return []});
 assert.equal(blocked.available,false);assert.equal(calls,0);
 const failed=await costDriverCombinations(products,[],10,async()=>{throw Error('provider')});assert.equal(failed.available,false);
});
