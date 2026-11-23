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
 otif_rate:{label:'OTIF (Prozent)',description:'Anteil pünktlicher und mengenkonformer Aufträge an allen bewertbaren Aufträgen.',sql:'100 × OTIF-Aufträge / Aufträge mit Lieferdaten und Toleranzstatus',requiresRate:false},
 late_penalty_eur:{label:'Verspätungsstrafe · 0,75 €/kg',description:'0,75 €/kg × verspätet gelieferte kg; vertragliches Berechnungsmodell, keine bezahlten Ist-Kosten.',sql:"0.75 * SUM(delivered_quantity) FILTER (WHERE delivered_date>promised_date AND delivered_quantity_unit='kg' AND [Filter])",requiresRate:false},
 shortfall_penalty_eur:{label:'Unterlieferungsstrafe · 0,75 €/kg',description:'0,75 €/kg × fehlende Liefermenge in kg; vertragliches Berechnungsmodell.',sql:"0.75 * SUM(GREATEST(ordered_quantity-delivered_quantity,0)) FILTER (WHERE delivered_quantity_unit='kg' AND [Filter])",requiresRate:false},
 total_penalty_eur:{label:'Gesamte berechnete Vertragsstrafe (€)',description:'Verspätungs- plus Unterlieferungsstrafe nach 0,75 €/kg. Kann dieselben Aufträge in beiden Komponenten berücksichtigen.',sql:"0.75 * (LateDeliveredKg + ShortfallKg) WHERE [validierte Filter]",requiresRate:false},
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
 return metric.unit.startsWith('EUR')?value+' €':value+(metric.unit==='%'?' %':' '+metric.unit);
}
