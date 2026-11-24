import test from 'node:test';import assert from 'node:assert/strict';
import {createInitialGraph,splitGraph,isValidReference,hasAnalyticCycle,referenceEdge,serializeDraft,restoreDraft,nodeFor,ROOT_ID} from './graph';
test('new workspace starts with configurable OTIF root, without factory branches',()=>{
 const g=createInitialGraph([{label:'Bonn',orders:10,on_time_rate:62,volume_rate:40}]);
 assert.equal(g.nodes.length,1);assert.equal(g.edges.length,0);
 assert.equal(g.nodes[0].data.analysis.kind,'root');assert.equal(g.nodes[0].data.analysis.metricId,'otifRate');
});
test('any root can be split to data-driven descendants',()=>{
 const g=createInitialGraph([]);
 const next=splitGraph(g.nodes,g.edges,ROOT_ID,'product_type',[{label:'Crates',orders:7,on_time_rate:40,volume_rate:20}]);
 assert.equal(next.nodes.length,2);assert.equal(next.edges.length,1);
 assert.equal(hasAnalyticCycle(next.nodes),false);
});
test('multiple independent origins and no cyclic connections',()=>{
 const g=createInitialGraph([]);
 const alt=nodeFor({id:'root:cost',parentId:null,label:'Contract Penalty',kind:'root',createdBy:'user',metricId:'totalPenaltyEur'},{x:700,y:80});
 const root=g.nodes[0];const nodes=[root,alt];
 assert.equal(isValidReference(ROOT_ID,'root:cost',[],nodes),true);
 const edges=[referenceEdge(ROOT_ID,'root:cost')];
 assert.equal(isValidReference('root:cost',ROOT_ID,edges,nodes),false);
 assert.equal(isValidReference('root:cost','root:cost',[],nodes),false);
});
test('chart node metric and visualization persist through serialization',()=>{
 const g=createInitialGraph([]);
 const node=nodeFor({id:'custom',parentId:null,label:'Kosten',kind:'metric',createdBy:'user',metricId:'totalPenaltyEur',visualization:'bar',chartDimension:'factory'},{x:50,y:200});
 const graph={nodes:[...g.nodes,node],edges:g.edges};
 const restored=restoreDraft(serializeDraft(graph.nodes,graph.edges,{}, {x:0,y:0,zoom:1}));
 assert.equal(restored.nodes[1].data.analysis.metricId,'totalPenaltyEur');
 assert.equal(restored.nodes[1].data.analysis.visualization,'bar');
 assert.equal(restored.nodes[1].data.analysis.chartDimension,'factory');
});

import {annotationEdge} from './graph';
import {effectiveFilters,makeFilter} from './filters';
import {findingStamp,findingStatus} from './findings';
test('annotation edges survive persistence without inheriting sibling filters',()=>{const g=createInitialGraph([]);const child=nodeFor({id:'doc',label:'Finding',kind:'note',parentId:null,createdBy:'user'},{x:600,y:400});const nodes=[...g.nodes,child];const edges=[annotationEdge(ROOT_ID,'doc')];const locals={[ROOT_ID]:[makeFilter('factory','Essen','local')]};assert.equal(effectiveFilters([],nodes.map(n=>n.data.analysis),locals,'doc',edges).length,0);const restored=restoreDraft(serializeDraft(nodes,edges,locals,{x:0,y:0,zoom:1}));assert.equal(restored.edges[0].data?.kind,'annotation');assert.equal(effectiveFilters([],restored.nodes.map(n=>n.data.analysis),locals,'doc',restored.edges).length,0);});
test('finding detects changed source filter and missing source; without live aggregate it is unverified',()=>{const g=createInitialGraph([]),source=ROOT_ID;const stamp=findingStamp(source,g.nodes,[],[],{});const finding={id:'doc',label:'Finding',kind:'note' as const,parentId:null,createdBy:'user' as const,finding:stamp};assert.equal(findingStatus(finding,g.nodes,[],[],{}).state,'unverified');assert.equal(findingStatus(finding,g.nodes,[],[makeFilter('factory','Essen')],{}).state,'stale');assert.equal(findingStatus(finding,[],[],[],{}).state,'stale')});
