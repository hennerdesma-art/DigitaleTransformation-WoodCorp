-- NXT Analytics v3 – workspace and filter-catalog persistence
-- Separate application data only. WoodCorp case and event tables are NOT modified.
CREATE TABLE IF NOT EXISTS public.nxt_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Meine Analyse' CHECK (char_length(title) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','team')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 2147483640),
  document jsonb NOT NULL CHECK (
    jsonb_typeof(document)='object'
    AND document->>'version'='3'
    AND jsonb_typeof(document->'graph')='object'
    AND jsonb_typeof(document->'dashboards')='object'
    AND jsonb_typeof(document->'globalFilters')='array'
    AND pg_column_size(document) <= 524288
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nxt_workspaces_owner_updated_idx ON public.nxt_workspaces(owner_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS nxt_workspaces_shared_idx ON public.nxt_workspaces(updated_at DESC) WHERE visibility='team' AND status='published';
ALTER TABLE public.nxt_workspaces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nxt_workspaces FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.nxt_workspaces TO authenticated;

DROP POLICY IF EXISTS nxt_workspace_read ON public.nxt_workspaces;
CREATE POLICY nxt_workspace_read ON public.nxt_workspaces FOR SELECT TO authenticated
USING (
  EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid()))
  AND (
    owner_id=(SELECT auth.uid())
    OR (visibility='team' AND status='published')
    OR EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid()) AND a.role='admin')
  )
);
DROP POLICY IF EXISTS nxt_workspace_create ON public.nxt_workspaces;
CREATE POLICY nxt_workspace_create ON public.nxt_workspaces FOR INSERT TO authenticated
WITH CHECK (
  owner_id=(SELECT auth.uid())
  AND EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid()) AND a.role IN('admin','analyst'))
);
DROP POLICY IF EXISTS nxt_workspace_edit ON public.nxt_workspaces;
CREATE POLICY nxt_workspace_edit ON public.nxt_workspaces FOR UPDATE TO authenticated
USING (
  EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid()) AND a.role IN('admin','analyst'))
  AND (
    owner_id=(SELECT auth.uid())
    OR EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid()) AND a.role='admin')
  )
)
WITH CHECK (
  EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid()) AND a.role IN('admin','analyst'))
  AND (
    owner_id=(SELECT auth.uid())
    OR EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid()) AND a.role='admin')
  )
);
DROP POLICY IF EXISTS nxt_workspace_delete ON public.nxt_workspaces;
CREATE POLICY nxt_workspace_delete ON public.nxt_workspaces FOR DELETE TO authenticated
USING (
  EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid()) AND a.role IN('admin','analyst'))
  AND (
    owner_id=(SELECT auth.uid())
    OR EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid()) AND a.role='admin')
  )
);

CREATE OR REPLACE FUNCTION public.nxt_save_workspace(
  p_id uuid, p_expected_revision integer, p_document jsonb
)
RETURNS TABLE(workspace_id uuid, new_revision integer, saved_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $f$
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 1
    OR p_document IS NULL OR jsonb_typeof(p_document) <> 'object'
    OR p_document->>'version'<>'3'
    OR jsonb_typeof(p_document->'graph')<>'object'
    OR jsonb_typeof(p_document->'dashboards')<>'object'
    OR jsonb_typeof(p_document->'globalFilters')<>'array'
    OR pg_column_size(p_document)>524288
  THEN RAISE EXCEPTION 'INVALID_WORKSPACE_DOCUMENT' USING ERRCODE='22023';
  END IF;
  UPDATE public.nxt_workspaces w SET
    document=p_document,revision=w.revision+1,updated_at=now()
  WHERE w.id=p_id AND w.revision=p_expected_revision
  RETURNING w.id,w.revision,w.updated_at
  INTO workspace_id,new_revision,saved_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKSPACE_REVISION_CONFLICT_OR_ACCESS_DENIED' USING ERRCODE='P0001';
  END IF;
  RETURN NEXT;
END $f$;
REVOKE ALL ON FUNCTION public.nxt_save_workspace(uuid,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nxt_save_workspace(uuid,integer,jsonb) TO authenticated;

CREATE TABLE IF NOT EXISTS public.nxt_filter_catalog (
  field_key text PRIMARY KEY CHECK (field_key IN ('factory','product_type','delivery_company','warehouse_type','cust_country','delivery_year')),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 80),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nxt_filter_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nxt_filter_catalog FROM PUBLIC,anon;
GRANT SELECT,UPDATE ON public.nxt_filter_catalog TO authenticated;
DROP POLICY IF EXISTS nxt_filter_catalog_read ON public.nxt_filter_catalog;
CREATE POLICY nxt_filter_catalog_read ON public.nxt_filter_catalog FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS nxt_filter_catalog_admin ON public.nxt_filter_catalog;
CREATE POLICY nxt_filter_catalog_admin ON public.nxt_filter_catalog FOR UPDATE TO authenticated
USING (EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid()) AND a.role='admin'))
WITH CHECK (EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid()) AND a.role='admin'));
INSERT INTO public.nxt_filter_catalog(field_key,display_name,sort_order)
VALUES ('factory','Werk',10),('product_type','Produkttyp',20),('delivery_company','Lieferunternehmen',30),('warehouse_type','Lagertyp',40),('cust_country','Kundenland',50),('delivery_year','Lieferjahr',60)
ON CONFLICT(field_key) DO NOTHING;
