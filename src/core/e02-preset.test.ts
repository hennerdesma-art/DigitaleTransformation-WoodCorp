import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validDocument} from './dashboard';
import {restoreDraft,isValidReference} from './graph';
import {effectiveFilters} from './filters';
import {E02_KEYS,validE02Key,days} from './processIntervals';
const preset=JSON.parse(readFileSync(new URL('../../presets/woodcorp-e00-e02-workspace.json',import.meta.url),'utf8'));
test('E00–E02 workspace is a valid, editable, complete NXT document',()=>{
 const document=validDocument(preset);
 assert.ok(document);
 assert.equal(document.graph.nodes.length,25);
 assert.equal(document.graph.edges.length,31);
 assert.equal(Object.keys(document.dashboards).length,25);
 assert.ok(Object.values(document.dashboards).every(d=>d.widgets.length>0));
 assert.equal(document.graph.nodes.filter(n=>!n.analysis.parentId).length,1);
 assert.equal(document.globalFilters.length,0);
 const graph=restoreDraft(document.graph);
 assert.equal(graph.nodes.length,25);
 assert.equal(graph.edges.length,31);
 for(const widget of Object.values(document.dashboards).flatMap(d=>d.widgets)){
  assert.ok(widget.title.length<=100);
  if(widget.type==='e02_distribution')assert.ok(validE02Key(widget.intervalKey));
 }
});
test('factory and product parallel parents combine only on correct focus paths',()=>{
 const document=validDocument(preset);assert.ok(document);
 const nodes=document.graph.nodes.map(n=>n.analysis);
 const edges=document.graph.edges.map(e=>({source:e.source,target:e.target}));
 const e=effectiveFilters([],nodes,{},'e02:focus-essen',edges);
 const a=effectiveFilters([],nodes,{},'e02:focus-aachen',edges);
 const base=effectiveFilters([],nodes,{},'e02:overview',edges);
 assert.ok(e.some(f=>f.field==='factory'&&f.value==='Essen'));
 assert.ok(e.some(f=>f.field==='product_type'&&f.value==='Crates'));
 assert.equal(e.some(f=>f.field==='factory'&&f.value==='Aachen'),false);
 assert.ok(a.some(f=>f.field==='factory'&&f.value==='Aachen'));
 assert.ok(a.some(f=>f.field==='product_type'&&f.value==='Crates'));
 assert.equal(a.some(f=>f.field==='factory'&&f.value==='Essen'),false);
 assert.equal(base.some(f=>f.field==='factory'),false);
 assert.equal(base.some(f=>f.field==='product_type'),false);
});
test('the five interval nodes always inherit their two focus filters',()=>{
 const document=validDocument(preset);assert.ok(document);
 const nodes=document.graph.nodes.map(n=>n.analysis);
 const edges=document.graph.edges.map(e=>({source:e.source,target:e.target}));
 assert.equal(E02_KEYS.length,5);
 for(const key of E02_KEYS){
  const id='e02:interval:'+key;
  const n=nodes.find(n=>n.id===id);assert.ok(n);
  assert.equal(n.visualization,'process_interval');
  assert.equal(n.intervalKey,key);
  const inherited=effectiveFilters([],nodes,{},id,edges);
  assert.equal(inherited.filter(f=>f.field==='factory'&&f.value==='Essen').length,1);
  assert.equal(inherited.filter(f=>f.field==='product_type'&&f.value==='Crates').length,1);
 }
 const graph=restoreDraft(document.graph);
 assert.equal(isValidReference('e02:interval:order_to_delivery','woodcorp:root',graph.edges,graph.nodes),false);
 assert.equal(days(null),'–');
});
