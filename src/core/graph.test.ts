import test from 'node:test';import assert from 'node:assert/strict';
import {createInitialGraph,splitGraph,isValidReference,hasAnalyticCycle,referenceEdge,serializeDraft,restoreDraft} from './graph';
test('system tree connects every factory with root',()=>{const g=createInitialGraph([{label:'Bonn',orders:10,on_time_rate:62,volume_rate:40},{label:'Essen',orders:8,on_time_rate:52,volume_rate:30}]);assert.equal(g.nodes.length,3);assert.equal(g.edges.length,2);assert.equal(g.edges.every(e=>e.data?.kind==='analytic'),true);});
test('split creates semantic descendants and preserves parent',()=>{const g=createInitialGraph([{label:'Bonn',orders:10,on_time_rate:62,volume_rate:40}]);const next=splitGraph(g.nodes,g.edges,'factory:Bonn','product_type',[{label:'Crates',orders:7,on_time_rate:40,volume_rate:20}]);assert.equal(next.nodes.length,3);assert.equal(next.edges.length,2);assert.equal(hasAnalyticCycle(next.nodes),false);});
test('no self, duplicate or cyclic connections',()=>{const g=createInitialGraph([{label:'Bonn',orders:10,on_time_rate:62,volume_rate:40}]);assert.equal(isValidReference('x','x',g.edges),false);assert.equal(isValidReference('root:otd','factory:Bonn',g.edges,g.nodes),false);assert.equal(isValidReference('factory:Bonn','root:otd',g.edges,g.nodes),false);assert.equal(isValidReference('unknown','root:otd',g.edges,g.nodes),false);});
test('parallel filtered graph branches may be linked in DAG but not linked backwards',()=>{
 const g=createInitialGraph([{label:'Bonn',orders:10,on_time_rate:62,volume_rate:40},{label:'Essen',orders:8,on_time_rate:52,volume_rate:30}]);
 assert.equal(isValidReference('factory:Bonn','factory:Essen',g.edges,g.nodes),true);
 const edges=[...g.edges,referenceEdge('factory:Bonn','factory:Essen')];
 assert.equal(isValidReference('factory:Essen','factory:Bonn',edges,g.nodes),false);
});
\ntest('a chart node keeps its configuration in the saved tree',()=>{
 const g=createInitialGraph([{label:'Essen',orders:8,on_time_rate:75,volume_rate:70}]);
 const node=g.nodes[1];node.data.analysis.visualization='bar';node.data.analysis.chartDimension='cust_market';
 const restored=restoreDraft(serializeDraft(g.nodes,g.edges,{}, {x:0,y:0,zoom:1}));
 assert.equal(restored.nodes[1].data.analysis.visualization,'bar');
 assert.equal(restored.nodes[1].data.analysis.chartDimension,'cust_market');
});
