import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeFor,referenceEdge,moveIntoContainer,removeContainer,serializeDraft,restoreDraft,isValidReference,cleanDraft,worldPosition,changeContainerSettings} from './graph';
import {effectiveFilters} from './filters';
import type {AnalysisNode,Filter} from './types';
const a=(id:string,kind:AnalysisNode['kind']='metric')=>nodeFor({id,kind,label:id,parentId:null,createdBy:'user'},{x:100,y:100});
const f=(field:Filter['field'],value:string):Filter=>({id:field+value,field,op:'eq',value});
test('one group edge inherits to all members without merging sibling or output filters',()=>{
 const initial=[a('root','root'),a('group','container'),a('a'),a('b'),a('out')];
 const edges=[referenceEdge('root','group'),referenceEdge('group','out')];
 const nodes=moveIntoContainer(moveIntoContainer(initial,edges,'a','group'),edges,'b','group');
 const topology=nodes.map(n=>n.data.analysis),locals={root:[f('delivery_year','2018')],group:[f('product_type','Crates')],a:[f('factory','Essen')],b:[f('factory','Aachen')]};
 assert.deepEqual(effectiveFilters([],topology,locals,'a',edges).map(x=>x.value),['2018','Crates','Essen']);
 assert.deepEqual(effectiveFilters([],topology,locals,'b',edges).map(x=>x.value),['2018','Crates','Aachen']);
 assert.deepEqual(effectiveFilters([],topology,locals,'out',edges).map(x=>x.value),['2018','Crates']);
});
test('implicit membership prevents cycles for new edges and drag grouping',()=>{
 const initial=[a('group','container'),a('a')];
 const nodes=moveIntoContainer(initial,[],'a','group');
 assert.equal(isValidReference('a','group',[],nodes),false);
 assert.throws(()=>moveIntoContainer(initial,[referenceEdge('a','group')],'a','group'),/Filterkreis/);
});
test('container roundtrip, detach and dissolve preserve absolute positions and members',()=>{
 const group=a('group','container'),child=a('child');
 let nodes=moveIntoContainer([group,child],[],'child','group',{x:150,y:210});
 nodes=changeContainerSettings(nodes,'group',{containerTone:'slate',containerCollapsed:true});
 const draft=serializeDraft(nodes,[],{}, {x:0,y:0,zoom:1});
 assert.ok(cleanDraft(draft));
 const restored=restoreDraft(draft).nodes;
 assert.equal(restored.find(n=>n.id==='child')?.parentId,'group');
 assert.equal(restored.find(n=>n.id==='group')?.data.analysis.containerTone,'slate');
 const pos=worldPosition(restored.find(n=>n.id==='child')!,restored);
 const dissolved=removeContainer(restored,'group');
 assert.equal(dissolved[0].parentId,undefined);
 assert.deepEqual(dissolved[0].position,pos);
 assert.equal(dissolved[0].data.analysis.containerId,undefined);
});
test('no nesting and bad saved membership rejected',()=>{
 assert.throws(()=>moveIntoContainer([a('g','container'),a('h','container')],[],'h','g'),/verschachtelt/);
 const draft=serializeDraft([a('a')],[],{}, {x:0,y:0,zoom:1});
 draft.nodes[0].analysis.containerId='missing';
 assert.equal(cleanDraft(draft),null);
});
