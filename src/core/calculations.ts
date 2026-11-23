import type {CalculationTemplate,CalculatedMetric} from './types';
export const CALCULATION_TEMPLATES:Record<CalculationTemplate,{label:string;description:string;sql:string;requiresRate:boolean}>={
 late_orders:{
  label:'Verspätete Aufträge',description:'Anzahl Fälle mit Lieferung nach zugesagtem Datum (Case-Grain).',
  sql:"SELECT COUNT(*) FILTER (WHERE delivered_date > promised_date) FROM woodcorp_cases WHERE [validierte Filter];",
  requiresRate:false
 },
 shortfall_kg:{
  label:'Unterlieferte Menge (kg)',description:'Positive Differenz Bestellmenge – Liefermenge, nur für kg und vollständige Mengen.',
  sql:"SELECT SUM(GREATEST(ordered_quantity - delivered_quantity, 0)) FROM woodcorp_cases WHERE delivered_quantity_unit = 'kg' AND [validierte Filter];",
  requiresRate:false
 },
 estimated_shortfall_cost_eur:{
  label:'Geschätzte Unterlieferungskosten (€)',description:'Rechnerische Unterlieferung in kg multipliziert mit ausdrücklich eingegebenem €/kg-Satz; keine nachgewiesenen Ist-Kosten.',
  sql:"SELECT SUM(GREATEST(ordered_quantity - delivered_quantity, 0)) * :rate_eur_per_kg FROM woodcorp_cases WHERE delivered_quantity_unit = 'kg' AND [validierte Filter];",
  requiresRate:true
 }
};
export const TEMPLATES=Object.keys(CALCULATION_TEMPLATES) as CalculationTemplate[];
export function validateRate(template:CalculationTemplate,rate:unknown):number|null{
 if(template!=='estimated_shortfall_cost_eur')return null;
 if(rate===undefined||rate===null||rate==='')throw Error('Bitte erst einen bestätigten Kostensatz in €/kg eingeben.');
 const number=typeof rate==='number'?rate:Number(rate);
 if(!Number.isFinite(number)||number<=0||number>10000)throw Error('Der Kostensatz muss zwischen 0 und 10.000 €/kg liegen.');
 return number;
}
export function formatCalculated(metric:CalculatedMetric|null):string{
 if(!metric||metric.value===null||!Number.isFinite(Number(metric.value)))return '–';
 const value=Number(metric.value).toLocaleString('de-DE',{maximumFractionDigits:metric.unit.startsWith('EUR')?2:1});
 return metric.unit.startsWith('EUR')?value+' €':value+' '+metric.unit;
}
