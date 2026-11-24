/** Amazon Bedrock Converse adapter. Only the approved EU inference profile is accepted.
 * This module has no access to browser state or Supabase service credentials.
 */
export const BEDROCK_REGION='eu-central-1';
export const BEDROCK_MODEL='eu.anthropic.claude-sonnet-4-6';
export type BedrockConfig={region:string;model:string;token:string};
type Env=(name:string)=>string|undefined;
export function bedrockConfig(env:Env):BedrockConfig|null{
 const token=env('AWS_BEARER_TOKEN_BEDROCK');
 // Provider and model are fixed, reviewed deployment constants; legacy generic model/provider secrets are intentionally unused.
 if(env('AWS_REGION')!==BEDROCK_REGION||!token?.trim())return null;
 return {region:BEDROCK_REGION,model:BEDROCK_MODEL,token:token.trim()};
}
export class BedrockError extends Error{
 constructor(message:string,public readonly status:number,public readonly providerStatus:number|null=null){super(message);this.name='BedrockError'}
}
function providerError(status:number){
 if(status===401||status===403)return new BedrockError('Amazon Bedrock: API-Key oder Modellberechtigung prüfen.',502,status);
 if(status===400||status===404)return new BedrockError('Amazon Bedrock: Modellprofil oder JSON-Schema nicht verfügbar.',502,status);
 if(status===429)return new BedrockError('Amazon Bedrock: Nutzungslimit erreicht. Bitte später erneut versuchen.',429,status);
 return new BedrockError('Amazon Bedrock ist vorübergehend nicht verfügbar.',502,status);
}
/** Express nullable primitive unions using Bedrock's documented anyOf subset. */
export function bedrockSchema(schema:unknown):unknown{
 if(Array.isArray(schema))return schema.map(bedrockSchema);
 if(!schema||typeof schema!=='object')return schema;
 const obj=schema as Record<string,unknown>,out:Record<string,unknown>={};
 for(const [k,v] of Object.entries(obj)){
  if(k==='type'&&Array.isArray(v)){out.anyOf=v.map(t=>({type:t}));continue}
  out[k]=bedrockSchema(v);
 }
 return out;
}
export async function requestBedrock(config:BedrockConfig,instructions:string,input:unknown,schema:unknown,fetcher:typeof fetch=fetch,timeout=110000){
 if(config.region!==BEDROCK_REGION||config.model!==BEDROCK_MODEL||!config.token)throw new BedrockError('Amazon Bedrock ist nicht konfiguriert.',503);
 const payload={system:[{text:instructions}],messages:[{role:'user',content:[{text:JSON.stringify(input)}]}],inferenceConfig:{maxTokens:3600,temperature:0.2},outputConfig:{textFormat:{type:'json_schema',structure:{jsonSchema:{name:'nxt_analysis_plan',schema:JSON.stringify(bedrockSchema(schema)),description:'NXT answer and validated workspace operations'}}}}};
 let res:Response;
 try{res=await fetcher('https://bedrock-runtime.'+config.region+'.amazonaws.com/model/'+encodeURIComponent(config.model)+'/converse',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+config.token},body:JSON.stringify(payload),signal:AbortSignal.timeout(timeout),redirect:'error'})}
 catch{throw new BedrockError('Amazon Bedrock: Anfrage hat das Zeitlimit überschritten oder der Dienst ist nicht erreichbar.',504)}
 if(!res.ok)throw providerError(res.status);
 let body:any;try{body=await res.json()}catch{throw new BedrockError('Amazon Bedrock: Ungültige Antwort.',502)}
 if(body.stopReason!=='end_turn')throw new BedrockError('Amazon Bedrock: Antwort nicht vollständig. Bitte Anfrage eingrenzen.',502);
 const content=body.output?.message?.content;
 if(!Array.isArray(content))throw new BedrockError('Amazon Bedrock: Keine verwertbare Antwort.',502);
 const text=content.map((part:any)=>typeof part?.text==='string'?part.text:'').join('');
 if(!text||text.length>100000)throw new BedrockError('Amazon Bedrock: Keine verwertbare Antwort.',502);
 let plan:unknown;try{plan=JSON.parse(text)}catch{throw new BedrockError('Amazon Bedrock: Antwort entspricht nicht dem JSON-Format.',502)}
 const usage={inputTokens:Number.isInteger(body.usage?.inputTokens)?body.usage.inputTokens:null,outputTokens:Number.isInteger(body.usage?.outputTokens)?body.usage.outputTokens:null};
 return {plan,usage};
}
