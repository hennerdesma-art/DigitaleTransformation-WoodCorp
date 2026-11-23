/** E02 WoodCorp definitions: one row per Case-Key, durations in calendar days. */
export const E02_INTERVALS={
 order_to_production:{
  title:'Auftrag → Produktionsstart',short:'Vor Produktionsstart',
  start:'woodcorp_activities: Order received',end:'woodcorp_activities: Start production',
  formula:'(Start production − Order received) / 86.400 Sekunden'
 },
 production_duration:{
  title:'Produktionsstart → Produktionsende',short:'Produktion',
  start:'woodcorp_activities: Start production',end:'woodcorp_activities: Finished production',
  formula:'(Finished production − Start production) / 86.400 Sekunden'
 },
 production_to_shipment:{
  title:'Produktionsende → Verladung',short:'Übergabe/Verladung',
  start:'woodcorp_activities: Finished production',end:'woodcorp_activities: Load shipment',
  formula:'(Load shipment − Finished production) / 86.400 Sekunden'
 },
 shipment_to_delivery:{
  title:'Verladung → tatsächliche Lieferung',short:'Transport',
  start:'woodcorp_activities: Load shipment',end:'woodcorp_cases: delivered_date',
  formula:'(delivered_date − Load shipment) / 86.400 Sekunden'
 },
 order_to_delivery:{
  title:'Auftrag → tatsächliche Lieferung',short:'Gesamtdurchlaufzeit',
  start:'woodcorp_activities: Order received',end:'woodcorp_cases: delivered_date',
  formula:'(delivered_date − Order received) / 86.400 Sekunden'
 }
} as const;
export type E02IntervalKey=keyof typeof E02_INTERVALS;
export const E02_KEYS=Object.keys(E02_INTERVALS) as E02IntervalKey[];
export type E02IntervalStat={
 key:E02IntervalKey;position:number;caseCount:number;validCases:number;missingCases:number;
 negativeCases:number;anomalyCases:number;coveragePct:number|null;medianDays:number|null;
 p90Days:number|null;meanDays:number|null;otifValidCases:number;nonOtifValidCases:number;
 otifMedianDays:number|null;nonOtifMedianDays:number|null;
};
export type E02Summary={
 definitionVersion:string;caseCount:number;source:string;units:'days';intervals:E02IntervalStat[];
};
export type E02DistributionBucket={
 sort_order:number;bucket:string;cases:number;otif_cases:number;non_otif_cases:number;
};
export function days(n:number|null|undefined):string{
 return n==null||!Number.isFinite(Number(n))?'–':Number(n).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' Tage';
}
export function validE02Key(value:unknown):value is E02IntervalKey{
 return typeof value==='string'&&Object.prototype.hasOwnProperty.call(E02_INTERVALS,value);
}
