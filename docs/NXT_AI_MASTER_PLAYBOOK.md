# NXT AI Master Playbook v1.0

## Purpose
NXT Intelligence is a context-aware workspace copilot: explain selected blocks, propose changes, build a reproducible investigation path. Always preserve validated WoodCorp measures and NXT design. The executable model instructions are in supabase/functions/nxt-intelligence/knowledge.ts, versioned alongside the allowed action schema.

## Data and methods
- Case grain and event grain stay separate; join via case_key. Source of truth: src/core/kpiDefinitions.ts, src/core/processIntervals.ts, SQL migrations and authenticated aggregate RPCs.
- E00: baseline, OTIF vs OTD vs volume, absolute order count and modeled penalty. E01: compare failure classes and segment impact (factory, product, carrier, market). E02: median/P90, compare OTIF/non-OTIF, missing and negative durations. A01: investigate order changes after controlling for relevant segments.
- Hypotheses, confounders, observed evidence and coverage stay separate. No causal certainty from correlations. No fabricated values. Costs are 0.75 EUR/kg modeled, never accounting facts. No automatic target.
- Reuse NXT and UI/UX Pro Max design rules, existing 22 widget types, filter catalog, semantic container model. One research question per dashboard; choose charts by analytic purpose. Labels must reflect actual renderer (line and donut fixed OTD).
- All arrows and group membership propagate AND filters; never combine mutually exclusive sibling filters. Add container then its members; no nesting. Keep existing unrelated blocks. Use preview, validate, approve, then save.

## Workflow
1. Persistent bottom-right launcher shows current workspace and selected block automatically. Chats separated by workspace for the current browser session; no remote chat-history persistence.
2. Local mode answers from selected KPI definition and authorized aggregate metrics; explicit dashboard/path shortcuts create deterministic editable proposals. Not free-form AI.
3. Model mode only when server configuration is active and user explicitly opts in to sending context. Server validates session + current membership and workspace ownership/visibility/revision via user RLS. Only selected aggregate metrics and bounded segment/process evidence; suppress small samples; no raw event or case rows. No automatic tools, writes or arbitrary SQL.
4. Model returns plain answer plus allowlisted structured actions. Server validates actions; client dry-runs entire transaction and checks existing node/widget IDs, chart capabilities, filters, graph limits and cycle rules. Stale proposals cannot apply. Click applies changes in local workspace draft atomically. Save uses existing optimistic revision/RLS. Undo/redo includes graph, local filters and dashboards.
5. Current action set: create branch/container, rename node/widget, add/remove widget, set research question, change node KPI, add equality filter. No global filter changes, no node deletion, no container nesting, no unrestricted SQL.
6. Model mode sends user question, limited recent chat, current configuration metadata, filters (address code values excluded), and aggregate evidence to configured OpenAI API. Do not include personal data in labels/prompts. API uses store:false; provider data processing terms still apply.

## Activation (administrator)
- Deploy function nxt-intelligence from matching source files, with manual JWT validation (auth.getUser) and membership lookup. Function is fail-closed on missing config.
- Apply sql/nxt_ai_request_budget.sql; server-only quota, 20 requests per user/day, 100 project-wide/day, five-second gap per user, UTC; no prompts stored. The actual provider cost also depends on selected model/token use; configure spending limit in provider account.
- In Supabase project maqyirapxoygcsljdqyk -> Edge Functions -> Secrets set OPENAI_API_KEY and NXT_AI_MODEL to a structured-output-capable model available in the API account. Set NXT_AI_ENABLED=true ONLY after reviewing data transfer and provider billing. Do not commit secrets or paste them into chat.
- Verify status as authorized user, test one real model request, test viewer/nonmember rejection, budget and stale proposal. Model activation must not be claimed before these tests. Use official OpenAI structured output and Supabase auth/secrets docs.
