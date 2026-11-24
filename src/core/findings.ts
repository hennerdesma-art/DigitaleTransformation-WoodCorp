import type {AnalysisNode,Filter,FindingStamp,Metrics} from './types';
import type {NNode,NEdge} from './graph';
import {effectiveFilters,filterSignature} from './filters';
export const metricFingerprint=(m:Metrics|null|undefined)=>m?JSON.stringify(Object.entries(m).sort(([a],[b])=>a.localeCompare(b))):null;
export function findingStamp(sourceId:string,nodes:NNode[],edges:NEdge[],globals:Filter[],locals:Record<string,Filter[]>):FindingStamp{
 const source=nodes.find(n=>n.id===sourceId);
 if(!source||source.data.analysis.kind==='note')throw Error('Bitte einen gültigen Analyseblock als Quelle wählen.');
 const filterKey=filterSignature(effectiveFilters(globals,nodes.map(n=>n.data.analysis),locals,sourceId,edges));
 const current=source.data.appliedFilters&&!source.data.busy&&!source.data.error&&filterSignature(source.data.appliedFilters)===filterKey;
 return {sourceId,filterKey,metricsKey:current?metricFingerprint(source.data.fullMetrics):null,recordedAt:new Date().toISOString()};
}
export function findingStatus(a:AnalysisNode,nodes:NNode[],edges:NEdge[],globals:Filter[],locals:Record<string,Filter[]>):{state:'current'|'stale'|'unverified'|'pending';text:string}{
 if(!a.finding)return {state:'unverified',text:'Freie Anmerkung · ohne Datenbezug'};
 const source=nodes.find(n=>n.id===a.finding!.sourceId);
 if(!source)return {state:'stale',text:'Quelle entfernt · Finding prüfen'};
 let now:FindingStamp;try{now=findingStamp(source.id,nodes,edges,globals,locals)}catch{return {state:'stale',text:'Filterkontext ungültig · Finding prüfen'}}
 if(now.filterKey!==a.finding.filterKey)return {state:'stale',text:'Filterkontext geändert · Finding prüfen'};
 if(a.finding.metricsKey===null)return {state:'unverified',text:'Noch nicht mit Live-KPIs abgeglichen'};
 if(now.metricsKey===null)return {state:'pending',text:'Datenabgleich ausstehend'};
 return now.metricsKey===a.finding.metricsKey?{state:'current',text:'Filter und KPI-Snapshot unverändert'}:{state:'stale',text:'Kennzahlen geändert · Finding prüfen'};
}
