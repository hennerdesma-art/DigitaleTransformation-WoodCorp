/** Bounded, read-only aggregate drilldown. No raw rows and no arbitrary user-defined SQL. */
type Predicate={field:string;op:string;value:string|string[]};
type Cell={factory:string;product_type:string;delivery_company:string;orders:number;otif_rate:number|null;total_penalty_eur:number};
const safeLabel=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=200;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export const isCostDrilldown=(prompt:string)=>/vertragsstraf|strafkost|kosten|penalt|cost driver|loss driver/i.test(prompt);
export async function costDriverCombinations(products:unknown,filters:Predicate[],totalOrders:number,query:(scoped:Predicate[])=>Promise<unknown>){
 const unavailable=(reason:string)=>({scope:'selected node effective filters',available:false,reason});
 if(!Array.isArray(products)||!finite(totalOrders)||totalOrders<5)return unavailable('Product aggregates unavailable.');
 // Existing equality must be preserved; skip a duplicate predicate when possible.
 const fixed=filters.filter(f=>f.field==='product_type'&&f.op==='eq');
 if(filters.length>=12&&!fixed.length)return unavailable('Filter limit reached; no additional product predicate may be added.');
 const eligible=products.filter(p=>safeLabel(p?.label)&&finite(p?.orders)&&p.orders>=5&&(!fixed.length||fixed.every(f=>f.value===p.label)));
 const candidates=eligible.slice().sort((a,b)=>(finite(b.total_penalty_eur)?b.total_penalty_eur:0)-(finite(a.total_penalty_eur)?a.total_penalty_eur:0)).slice(0,4);
 if(!candidates.length)return unavailable('No eligible product groups.');
 const results=await Promise.allSettled(candidates.map(async p=>({product:p.label,orders:p.orders,rows:await query(fixed.length?filters:[...filters,{field:'product_type',op:'eq',value:p.label}])})));
 const cells:Cell[]=[];let complete=candidates.length===products.length&&products.length<30&&candidates.reduce((n,p)=>n+p.orders,0)===totalOrders;
 for(const result of results){
  if(result.status!=='fulfilled'||!Array.isArray(result.value.rows)){complete=false;continue;}
  const {product,orders,rows}=result.value;let covered=0;
  if(rows.length>=150)complete=false;
  for(const row of rows){
   if(!safeLabel(row?.x)||!safeLabel(row?.y)||!finite(row?.orders)||row.orders<5||!finite(row?.total_penalty_eur)){complete=false;continue;}
   covered+=row.orders;
   cells.push({factory:row.x,product_type:product,delivery_company:row.y,orders:row.orders,otif_rate:finite(row.otif_rate)?row.otif_rate:null,total_penalty_eur:row.total_penalty_eur});
  }
  if(covered!==orders)complete=false;
 }
 cells.sort((a,b)=>b.total_penalty_eur-a.total_penalty_eur);
 if(!cells.length)return unavailable('No eligible joint cells.');
 return {scope:'selected node effective filters',available:true,allEligibleGroupsCovered:complete,eligibleCombinationCount:cells.length,displayedCombinationCount:Math.min(12,cells.length),policy:'Ranked by modeled total penalty among returned joint cells. At most four product queries; each RPC may return up to 150 cells by order count; cells with fewer than five orders or unknown labels omitted. The listed maximum is exhaustive only if allEligibleGroupsCovered is true.',combinations:cells.slice(0,12)};
}
