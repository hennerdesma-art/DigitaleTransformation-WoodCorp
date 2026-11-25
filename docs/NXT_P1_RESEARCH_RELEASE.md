# NXT P1 – Smart Layout & Deep Analysis

## Deployment order
1. Review and apply `sql/nxt_deep_analysis_p1.sql` to the existing WoodCorp Supabase project using its approved migration workflow. The new function is read-only, SECURITY INVOKER, schema-qualified, and executable only by authenticated users subject to the existing membership RLS policies. It does not update data or replace the approved KPI/penalty functions.
2. Validate baseline, scoped rows, authorization, grouped totals, process/variant counts and empty responses using the smoke checks below / release QA.
3. Build and deploy the validated frontend commit. Existing workspace document versions 2/3 stay unchanged; research widgets add an optional strictly validated research specification. No new production dependencies.
4. Verify an authorized user's existing workspace, Smart Layout preview and undo, and one new live research block. A viewer must not be able to apply geometry or persist a new card.

## UX
- Thinking Path toolbar: Smart Layout (Hybrid, Decision Tree, Free canvas), before/after preview, level navigation, explicit apply, undo, health report. Layout never changes links, filters, node IDs, findings or KPI definitions.
- Deep Analysis toolbar and magnifying glass on analysis cards: effective filter context, case explorer, process explorer, chronological/source variants, up to three dimensions, stratified comparisons, cost drivers and data quality.
- The same live research renderer is available as a resizable Canvas/Dashboard element. Use the explorer's pin action to create a filter-inheriting child. Save display settings explicitly; pages, searches, individual-case drill-down and temporary group drill-down are not persisted. Clear temporary canvas filters before adding a durable block/finding.
- Findings can be entered after an aggregate investigation; note text should contain the tested group/context, values and limitations, and no customer identifiers. Finding snapshots validate the existing aggregate metric/filter context, not correctness of a statistical claim.

## Methods and boundaries
- All denominators are case grain and use approved coverage definitions. kg penalties retain the existing 0.75 EUR/kg model and the separate eligible populations for late/shortfall costs.
- Chronological process transitions use retained non-anomalous timestamps, with stable tie-order used only for visualization. Timing statistics exclude tied endpoints. Chronological variants group same-time activities; source variants use the existing stored source sorting sequence.
- Multidimensional groupings are allowlisted and paginated; no arbitrary SQL. Comparisons use at most three low-cardinality controls, raw Wilson CIs, Newcombe difference intervals, a pooled two-proportion z-test with adequate expected counts, and pooled-support standardization. Adjusted effects are descriptive, no adjusted p-value. Observational records do not establish causality and repeated customer records may violate independence.
- Data-quality checks identify missing data, unusual order/intervals and conflicting source indicators. They do not replace approved definitions or repair data. Orphans are only assessed globally. Source-order process snapshots require rebuild after data import.

## Verification
The migration must be tested under transaction/rollback against actual data before applying it. Then verify member/nonmember RLS, cost identity, group sum, valid and invalid dimensions, same-context case lookup, chronological/source variant sums and drill token, and empty filtered sets. Frontend CI checks existing and new tests; isolated browser fixtures must use synthetic data only. A real signed-in production test remains a distinct acceptance step.
