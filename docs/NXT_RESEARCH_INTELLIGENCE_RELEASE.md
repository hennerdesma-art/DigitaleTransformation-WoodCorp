
# NXT Intelligence v1.6 / P2.A release

## Scope
- Shared frontend/edge action validator. Live research widgets (all P1 and P2.A tabs), JSON configuration for supported tables/bars/bubbles/trends/scenarios, in-place widget configuration, card sizing, Smart Layout. Existing graph format 3/workspace version remain compatible.
- Explicit request intent, 18,000-character prompt, continuation with the original complete prompt. Preview and explicit apply are mandatory; no automatic workspace saves.
- Filter-scoped aggregate data checks before and after proposal. At most three selected-context research requests plus four proposed-branch checks, subject to deadline. At most two Bedrock calls: either one bounded validation correction or one bounded interpretation of verified aggregate evidence. Quota reservation remains one user request. If interpretation fails, the validated plan and deterministic verified summaries remain available. No raw case/event rows or structured customer identifiers sent to the model. Users must not put sensitive identifiers in free text.
- New read-only RPC `nxt_process_analysis`: editable reference, unambiguous transition timing, repeated activities, activity-pattern case selection. Reuse approved cost and OTIF definitions. Pattern/reference selections are persisted within research widgets, not silently global filters.
- No approved company reference is available. Proposed reference checks first valid milestone occurrence, not contractual conformity. No waiting-time measurement or causal attribution from elapsed time. A repeated event is not necessarily rework. Same-time/invalid timestamps are handled explicitly.

## Release gate
1. Apply/test SQL in a rollback transaction; verify group partitions, exact drill-down, invalid options, RLS.
2. Run feature CI, Deno check and synthetic browser QA. Existing P1 tests remain.
3. Verify current main and current deployed edge version, apply additive SQL migration, verify smoke checks. Deploy edge with its existing JWT/auth configuration, then fast-forward tested main; confirm Pages deployment. If frontend deploy is delayed, older clients do not receive research-only actions.
4. Signed-in production acceptance: use a fresh workspace; ask for a controlled quantity comparison, a configurable customer bubble, process conformance, and whole-path layout. Compare displayed results to actual live filters. Continue one multi-stage request; verify no duplication or edits outside the requested scope. Test viewer permissions. Do not claim external model quality from synthetic tests alone.
