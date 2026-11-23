# NXT Analytics — Phases 4 + 5

## Dashboard builder

- A dashboard is configured **per selected analytical node**. The existing Decision Tree remains the primary analysis view.
- Widget types: KPI, line trend, bar chart, table, donut chart, text.
- Each KPI widget uses verified live Supabase metrics. Other charts use case-level aggregates; no hardcoded sample figures.
- Editor can drag widgets from library, reorder by drag and drop, add with keyboard-accessible plus control, change width/metric/dimension/title/text, delete, and save.
- Default dashboards are generated in the UI if the node has no custom configuration. New customizations persist with a saved workspace.
- Responsive dashboard builder has a palette, preview workspace, and widget inspector.

## Shared workspace persistence

- SQL source: `sql/nxt_analytics_v3_workspaces.sql` (executed in **Woodcorp Process Intelligence** project, NOT NXT network-research project).
- Table: `nxt_workspaces`. A versioned JSON document contains graph nodes/edges/viewport/local filters, global filters and per-node dashboards.
- Table: `nxt_filter_catalog`. Admin can enable/disable the six server-approved dimension keys. It does not let a user add arbitrary SQL columns.
- Only analysts and admins can create. Read rights: owner, administrator or published team workspace for authenticated approved members. Update/delete: owner or administrator with editor role.
- Workspace saves use a compare-and-swap RPC (`nxt_save_workspace`) to reject outdated revisions.
- Default new workspace is private. Publishing makes it visible to approved team members; it does NOT change raw data access.
- On first use, old local browser drafts remain available and can be saved as a new workspace. No automatic server overwrite.
- A local draft still serves as an optional offline fallback, but **server saves must succeed** before the app claims shared persistence.

## Testing and current limitations

- `npm test`: graph and filter integrity + dashboard widget validations.
- `npm run build`: TypeScript and Vite, SVG assets.
- Browser QA still required: admin/editor/viewer accounts, multi-session revision conflict, drag and drop, mobile viewport and Pages deployment.
- Custom server-side filtering remains restricted to verified dimensions. Generic ad-hoc SQL is forbidden.
- There is no claim that the dashboard editor performs causal discovery: segment differences are descriptive.