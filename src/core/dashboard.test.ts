import test from 'node:test';import assert from 'node:assert/strict';
import {addWidget,moveWidget,updateWidget,removeWidget,normalizeDashboard,standardDashboard,metricFormat,metricValue,validDocument,makeDocument} from './dashboard';
import {createInitialGraph,serializeDraft} from './graph';
test('a new dashboard has live-data widgets',()=>{const d=standardDashboard();assert.equal(d.widgets.length,6);assert.ok(d.widgets.every(w=>w.id));});
test('add, move and remove preserves unique IDs',()=>{let d=standardDashboard();d=addWidget(d,'text',1);assert.equal(d.widgets.length,7);const id=d.widgets[1].id;d=moveWidget(d,id,6);assert.equal(d.widgets[6].id,id);d=updateWidget(d,id,{title:'Hypothese'});assert.equal(d.widgets[6].title,'Hypothese');d=removeWidget(d,id);assert.equal(d.widgets.length,6);});
test('invalid widget fields are rejected',()=>{const d=standardDashboard();assert.equal(normalizeDashboard({...d,widgets:[{...d.widgets[0],metric:'DROP TABLE'}]}),null);assert.equal(normalizeDashboard({...d,widgets:[d.widgets[0],d.widgets[0]]}),null);});
test('metric values use actual data, not placeholder',()=>{assert.equal(metricFormat('onTimeRate',64.5),'64,5 %');assert.equal(metricValue('orders',{orders:19,onTimeRate:60,volumeConformanceRate:null,dateCoverage:18},null),19);});
test('workspace document must be versioned and valid',()=>{const g=createInitialGraph([{label:'Bonn',orders:12,on_time_rate:75,volume_rate:70}]);const draft=serializeDraft(g.nodes,g.edges,{}, {x:0,y:0,zoom:1});const doc=makeDocument(draft,[],{});assert.equal(validDocument({...doc,version:2}),null);assert.ok(validDocument(doc));});
test('custom KPI names are persisted without changing metric calculations',()=>{
 const g=createInitialGraph([{label:'Essen',orders:4,on_time_rate:70,volume_rate:30}]);
 const draft=serializeDraft(g.nodes,g.edges,{}, {x:0,y:0,zoom:1});
 const doc=makeDocument(draft,[],{}, {onTimeRate:'Lieferquote',orders:'Anzahl Bestellungen'});
 assert.equal(validDocument(doc)?.metricNames?.onTimeRate,'Lieferquote');
 assert.equal(metricFormat('onTimeRate',72.5),'72,5 %');
 assert.equal(validDocument({...doc,metricNames:{onTimeRate:'x'.repeat(81)}}),null);
 assert.equal(validDocument({...doc,metricNames:{untrusted:'Unbekannt'}}),null);
});

test('widget geometry is optional, bounded and preserved in workspace roundtrip',()=>{const d=standardDashboard(),id=d.widgets[0].id;const updated=updateWidget(d,id,{width:'full',displayHeight:480});assert.equal(normalizeDashboard(updated)?.widgets[0].displayHeight,480);assert.equal(normalizeDashboard(updated)?.widgets[0].metric,d.widgets[0].metric);assert.equal(normalizeDashboard(updateWidget(updated,id,{displayHeight:Infinity})),null);assert.equal(normalizeDashboard(updateWidget(updated,id,{displayHeight:1001})),null);const g=createInitialGraph([]),doc=makeDocument(serializeDraft(g.nodes,g.edges,{}, {x:0,y:0,zoom:1}),[],{[g.nodes[0].id]:updated});assert.equal(validDocument(doc)?.dashboards[g.nodes[0].id].widgets[0].displayHeight,480);assert.ok(normalizeDashboard(d));});
