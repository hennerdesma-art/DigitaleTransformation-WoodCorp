-- NXT Analytics: hard-delete team Auth identities without leaving a required
-- creator FK in the private invitation audit. Members/workspaces cascade via
-- their existing auth.users foreign keys; invitations for the deleted identity
-- are subsequently removed by the admin-only Edge Function.
--
-- This is schema-only; no existing member or audit record is removed.
BEGIN;
ALTER TABLE public.nxt_invitation_audit
  ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.nxt_invitation_audit
  DROP CONSTRAINT IF EXISTS nxt_invitation_audit_created_by_fkey;
ALTER TABLE public.nxt_invitation_audit
  ADD CONSTRAINT nxt_invitation_audit_created_by_fkey
  FOREIGN KEY(created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
COMMIT;
