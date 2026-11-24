import test from 'node:test';import assert from 'node:assert/strict';
import {bedrockConfig,bedrockSchema,requestBedrock,BedrockError,BEDROCK_MODEL,BEDROCK_REGION,BEDROCK_MAX_OUTPUT_TOKENS} from '../../supabase/functions/nxt-intelligence/bedrock';
import {PLAN_SCHEMA,validatePlan,action} from './assistantProtocol';
const env:Record<string,string>={AWS_REGION:BEDROCK_REGION,NXT_AI_MODEL:BEDROCK_MODEL,NXT_AI_PROVIDER:'bedrock',AWS_BEARER_TOKEN_BEDROCK:'synthetic-test-token'};
const cfg=bedrockConfig(k=>env[k])!;
test('provider config is fail-closed, EU profile only, no OpenAI fallback',()=>{
 assert.ok(cfg);assert.equal(bedrockConfig(k=>k==='AWS_BEARER_TOKEN_BEDROCK'?undefined:env[k]),null);assert.equal(bedrockConfig(k=>k==='AWS_REGION'?'us-east-1':env[k]),null);assert.equal(bedrockConfig(k=>k==='NXT_AI_MODEL'?'global.anthropic.claude-sonnet-4-6':env[k])?.model,BEDROCK_MODEL);assert.equal(bedrockConfig(k=>k==='NXT_AI_PROVIDER'?'openai':env[k])?.model,BEDROCK_MODEL);assert.equal(bedrockConfig(k=>env[k],'eu.anthropic.claude-opus-4-6-v1')?.model,'eu.anthropic.claude-opus-4-6-v1');assert.equal(bedrockConfig(k=>env[k],'global.anthropic.claude-opus-4-6-v1'),null);
});
test('Converse request uses bearer auth and strict structured output; validates returned plan',async()=>{
 const expected={answer:'Test',operations:[action('add_widget','smoke:root',{widgetType:'kpi',label:'OTIF',metric:'otifRate'})]};
 const mock:typeof fetch=async(url,init)=>{
  assert.equal(url,'https://bedrock-runtime.eu-central-1.amazonaws.com/model/eu.anthropic.claude-sonnet-4-6/converse');
  assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer synthetic-test-token');
  const body=JSON.parse(String(init?.body));assert.equal(body.outputConfig.textFormat.type,'json_schema');assert.equal(body.inferenceConfig.maxTokens,8192);assert.equal(BEDROCK_MAX_OUTPUT_TOKENS,8192);assert.deepEqual(JSON.parse(body.outputConfig.textFormat.structure.jsonSchema.schema),bedrockSchema(PLAN_SCHEMA));
  assert.equal(init?.redirect,'error');return new Response(JSON.stringify({stopReason:'end_turn',output:{message:{content:[{text:JSON.stringify(expected)}]}},usage:{inputTokens:100,outputTokens:30}}),{status:200});
 };
 const got=await requestBedrock(cfg,'Synthetic instructions',{question:'test'},PLAN_SCHEMA,mock);
 assert.deepEqual(validatePlan(got.plan,['smoke:root'],[],true),expected);assert.equal(got.usage.outputTokens,30);
});
test('HTTP, truncated, malformed and unauthorized replies fail safely',async()=>{
 for(const status of [400,401,403,429,500]){
  const mock:typeof fetch=async()=>new Response('do not expose provider body',{status});
  await assert.rejects(requestBedrock(cfg,'x',{},PLAN_SCHEMA,mock),e=>e instanceof BedrockError&&e.providerStatus===status&&!e.message.includes('provider body'));
 }
 const truncated:typeof fetch=async()=>new Response(JSON.stringify({stopReason:'max_tokens',output:{message:{content:[{text:'{}'}]}}}));
 await assert.rejects(requestBedrock(cfg,'x',{},PLAN_SCHEMA,truncated),BedrockError);
 const invalid:typeof fetch=async()=>new Response(JSON.stringify({stopReason:'end_turn',output:{message:{content:[{text:'not JSON'}]}}}));
 await assert.rejects(requestBedrock(cfg,'x',{},PLAN_SCHEMA,invalid),BedrockError);
 await assert.rejects(requestBedrock({...cfg,region:'us-east-1'},'x',{},PLAN_SCHEMA,invalid),BedrockError);
});

test('max_tokens and safety stop reasons are distinct; incomplete plans never accepted',async()=>{
 for(const [reason,pattern] of [['max_tokens',/Antwortbudget ausgeschöpft/],['model_context_window_exceeded',/Kontextgrenze/],['content_filtered',/Sicherheitsprüfung/],['tool_use',/Kein vollständiger/]] as const){
  let calls=0;const mock:typeof fetch=async()=>{calls++;return new Response(JSON.stringify({stopReason:reason,output:{message:{content:[{text:JSON.stringify({answer:'x',operations:[]})}]}},usage:{outputTokens:8192}}))};
  await assert.rejects(requestBedrock(cfg,'x',{},PLAN_SCHEMA,mock),e=>e instanceof BedrockError&&pattern.test(e.message));assert.equal(calls,1);
 }
});
