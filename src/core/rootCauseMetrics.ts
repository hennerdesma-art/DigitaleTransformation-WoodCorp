// Derived metrics computed by the existing case-grain Supabase RPCs.
export const ROOT_CAUSE_METRICS={
  orderedKg:['Bestellte Menge (kg)','kg','Summe nichtnegativer Bestellmengen ausschließlich in kg; fehlende Werte ausgeschlossen.'],
  deliveredKg:['Gelieferte Menge (kg)','kg','Summe nichtnegativer Liefermengen ausschließlich in kg; fehlende Werte ausgeschlossen.'],
  avgOrderedKg:['Ø Bestellgewicht je kg-Auftrag','kg/Auftrag','Durchschnitt der nichtnegativen Bestellmenge je auswertbarem kg-Auftrag; andere Einheiten ausgeschlossen.'],
  "penaltyPerOrderEur": [
    "Strafkosten je bewertbarem Auftrag",
    "€/Auftrag",
    "Modellkosten / Anzahl kg-Aufträge mit vollständigen Mengen und Lieferdaten."
  ],
  "penaltyPerKgEur": [
    "Strafkosten je bestelltem kg",
    "€/kg",
    "Modellkosten / bestellte kg derselben bewertbaren Fälle."
  ],
  "penaltyOrderValueRate": [
    "Strafe / Auftragswert (EUR-Annahme)",
    "%",
    "100 × Modellkosten / Auftragswert der bewertbaren Fälle mit positivem Auftragswert. Quellwährung nicht bestätigt; nur bei EUR interpretieren."
  ],
  "underDeliveryRate": [
    "Unterlieferungsquote",
    "%",
    "100 × Fälle mit Liefermenge < Bestellmenge / Fälle mit beiden Mengen; unabhängig vom Toleranzflag."
  ],
  "overDeliveryRate": [
    "Überlieferungsquote",
    "%",
    "100 × Fälle mit Liefermenge > Bestellmenge / Fälle mit beiden Mengen; unabhängig vom Toleranzflag."
  ],
  "overDeliveryKg": [
    "Überlieferte Masse",
    "kg",
    "Summe positiver Liefermenge minus Bestellmenge; ausschließlich kg."
  ],
  "quantityDeviationPct": [
    "Ø relative Mengenabweichung (mit Vorzeichen)",
    "%",
    "Mittelwert 100 × (Liefermenge − Bestellmenge) / Bestellmenge; Bestellmenge ungleich null."
  ],
  "orderConfirmationDays": [
    "Auftrag → Bestätigung · Median",
    "Tage",
    "Median des nichtnegativen Intervalls Order received → Confirm sale; fehlende/negative Intervalle ausgeschlossen."
  ],
  "productionPreparationDays": [
    "Bestätigung → Produktionsstart · Median",
    "Tage",
    "Median des nichtnegativen Intervalls Confirm sale → Start production; fehlende/negative Intervalle ausgeschlossen."
  ],
  "shipmentBufferDays": [
    "Restpuffer bei Verladung · Median",
    "Tage",
    "Median zugesagtes Lieferdatum minus Verladezeitpunkt; negative Werte zeigen überschrittenen Termin."
  ],
  "quantityChangesAfterStart": [
    "Mengenänderungen nach Produktionsstart",
    "Ereignisse",
    "Summe gültiger Change quantity-Ereignisse an späteren Kalendertagen als Produktionsstart; gleicher Tag nicht zugeordnet."
  ],
  "quantityChangesAfterEnd": [
    "Mengenänderungen nach Produktionsende",
    "Ereignisse",
    "Summe gültiger Change quantity-Ereignisse an späteren Kalendertagen als Produktionsende; gleicher Tag nicht zugeordnet."
  ],
  "quantityChangesAfterShip": [
    "Mengenänderungen nach Verladung",
    "Ereignisse",
    "Summe gültiger Change quantity-Ereignisse an späteren Kalendertagen als Verladung; gleicher Tag nicht zugeordnet."
  ],
  "creditBlockRate": [
    "Aufträge mit Kreditsperre",
    "%",
    "100 × Fälle mit mindestens einem Credit order block / Fälle mit Event-Merkmalen."
  ],
  "scheduleChangeRate": [
    "Aufträge mit Terminänderung",
    "%",
    "100 × Fälle mit mindestens einer Liefertermin- oder Produktionsstartänderung / Fälle mit Event-Merkmalen."
  ],
  "processVariantCount": [
    "Unterschiedliche Prozessvarianten",
    "Varianten",
    "Anzahl verschiedener Aktivitätsfolgen (Quellsortierung, event_id als Tie-Break)."
  ],
  "dataQualityCoverageRate": [
    "Chronologisch plausible Prozesse",
    "%",
    "100 × Fälle mit Qualitätsstatus Chronologisch plausibel / alle Fälle; strenge Sequenzprüfung, keine allgemeine Datenvollständigkeit."
  ]
} as const;
export type RootCauseMetric=keyof typeof ROOT_CAUSE_METRICS;
export const ROOT_CAUSE_KEYS=Object.keys(ROOT_CAUSE_METRICS) as RootCauseMetric[];
export const ROOT_CAUSE_LABELS=Object.fromEntries(ROOT_CAUSE_KEYS.map(k=>[k,ROOT_CAUSE_METRICS[k][0]])) as Record<RootCauseMetric,string>;
export const SEGMENT_METRIC_KEYS=['orders','otifCases','lateOrders','otifRate','onTimeRate','volumeConformanceRate','totalPenaltyEur','latePenaltyEur','shortfallPenaltyEur',...ROOT_CAUSE_KEYS] as const;
const legacy:Record<string,string>={orders:'orders',otifCases:'otif_cases',lateOrders:'late_orders',otifRate:'otif_rate',onTimeRate:'on_time_rate',volumeConformanceRate:'volume_rate',totalPenaltyEur:'total_penalty_eur',latePenaltyEur:'late_penalty_eur',shortfallPenaltyEur:'shortfall_penalty_eur'};
export function segmentMetric(row:object,metric:string):number|null{
 const value=(row as Record<string,unknown>)[legacy[metric]||metric];return typeof value==='number'&&Number.isFinite(value)?value:null;
}
export function formatRootCauseMetric(metric:RootCauseMetric,value:number){
 const unit=ROOT_CAUSE_METRICS[metric][1];const digits=unit==='€/kg'?4:unit==='€/Auftrag'||unit==='kg/Auftrag'||unit==='%'||unit==='Tage'?2:0;
 return value.toLocaleString('de-DE',{minimumFractionDigits:digits,maximumFractionDigits:digits})+' '+unit;
}
export function scenarioSavings(late:number,shortfall:number,lateReduction:number,shortfallReduction:number){
 if(![late,shortfall,lateReduction,shortfallReduction].every(Number.isFinite)||late<0||shortfall<0||lateReduction<0||lateReduction>100||shortfallReduction<0||shortfallReduction>100)throw Error('Ungültiges Kostenszenario');
 const saved=late*lateReduction/100+shortfall*shortfallReduction/100;return {saved,remaining:late+shortfall-saved};
}
