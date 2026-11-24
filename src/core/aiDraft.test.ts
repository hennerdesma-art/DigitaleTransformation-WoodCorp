import test from 'node:test';
import assert from 'node:assert/strict';
import {createDashboardDraft} from './aiDraft';
import {normalizeDashboard} from './dashboard';
test('dashboard preparation uses validated widgets and keeps disabled dimensions out',()=>{
 const draft=createDashboardDraft('segment','Vergleich', ['factory']);
 assert.ok(normalizeDashboard(draft));
 assert.equal(draft.question,'Vergleich');
 assert.ok(draft.widgets.every(w=>!w.compareDimension||w.compareDimension==='factory'));
 assert.ok(!draft.widgets.some(w=>w.type==='heatmap'));
});
test('executive draft contains distinct existing KPI keys',()=>{
 const draft=createDashboardDraft('executive','',[]);
 assert.deepEqual(draft.widgets.filter(w=>w.type==='kpi').map(w=>w.metric),['otifRate','onTimeRate','volumeConformanceRate','totalPenaltyEur']);
 assert.throws(()=>createDashboardDraft('process','x'.repeat(701),[]));
});
