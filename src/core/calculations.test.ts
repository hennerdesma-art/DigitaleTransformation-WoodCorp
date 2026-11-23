import test from 'node:test';import assert from 'node:assert/strict';
import {CALCULATION_TEMPLATES,TEMPLATES,validateRate,formatCalculated} from './calculations';
test('all displayed SQL suggestions are curated and parameterized',()=>{
 assert.ok(['otif_rate','late_penalty_eur','shortfall_penalty_eur','total_penalty_eur','estimated_shortfall_cost_eur'].every(k=>TEMPLATES.includes(k as any)));
 assert.ok(TEMPLATES.every(k=>!CALCULATION_TEMPLATES[k].sql.includes('DROP')));
});
test('estimated cost requires an explicit valid user rate',()=>{
 assert.throws(()=>validateRate('estimated_shortfall_cost_eur',undefined),/Kostensatz/);
 assert.throws(()=>validateRate('estimated_shortfall_cost_eur',-1),/Kostensatz/);
 assert.throws(()=>validateRate('estimated_shortfall_cost_eur',10001),/Kostensatz/);
 assert.equal(validateRate('estimated_shortfall_cost_eur',0.75),0.75);
 assert.equal(validateRate('shortfall_kg',undefined),null);
});
test('cost estimates are explicitly labeled',()=>{
 const fmt=formatCalculated({template:'estimated_shortfall_cost_eur',value:1234.56,unit:'EUR (Schätzung)',isEstimate:true,caseCount:20,eligibleCases:19,excludedCases:1,rateEurPerKg:0.75});
 assert.ok(fmt.includes('€'));assert.ok(fmt.includes('1.234'));
});
