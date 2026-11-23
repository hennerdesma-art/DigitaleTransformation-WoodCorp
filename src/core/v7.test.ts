import test from 'node:test';import assert from 'node:assert/strict';
import {createBlankWorkspaceGraph,serializeDraft,restoreDraft,createInitialGraph} from './graph';
import {standardDashboard,addWidget,normalizeDashboard,WIDGET_TYPES} from './dashboard';
test('every new workspace begins with exactly one neutral root, independently of prior factories',()=>{
 const first=createBlankWorkspaceGraph(), second=createBlankWorkspaceGraph();
 assert.equal(first.nodes.length,1);assert.equal(first.edges.length,0);
 assert.equal(first.nodes[0].data.analysis.label,'Ausgangsknoten');
 assert.equal(first.nodes[0].data.analysis.metricId,undefined);
 assert.equal(first.nodes[0].data.analysis.kind,'root');
 assert.notEqual(first.nodes[0].id,second.nodes[0].id);
 assert.equal(createInitialGraph([{label:'Bonn',orders:2,on_time_rate:50,volume_rate:50}]).nodes.length,1);
});
test('neutral workspace can be saved and restored without inheriting children or KPI',()=>{
 const g=createBlankWorkspaceGraph();
 const draft=serializeDraft(g.nodes,g.edges,{}, {x:0,y:0,zoom:1});
 const restored=restoreDraft(draft);
 assert.equal(restored.nodes.length,1);assert.equal(restored.nodes[0].data.analysis.metricId,undefined);
 assert.equal(restored.edges.length,0);
});
test('Celonis diagram variants are registered and persist validated parameters',()=>{
 for(const type of ['heatmap','stacked','stacked100','pareto','scatter','waterfall','histogram','treemap','funnel','bar_horizontal','bar_vertical','bullet'] as const){
  assert.ok(WIDGET_TYPES.includes(type));
  const d=addWidget(standardDashboard(),type);
  const last=d.widgets.at(-1);
  assert.equal(last?.type,type);
  assert.equal(normalizeDashboard(d)?.widgets.at(-1)?.type,type);
 }
});
