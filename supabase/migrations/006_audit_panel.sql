-- 006_audit_panel.sql

-- 1. Create Indices for Audit Queries
-- (occurred_at DESC) for global timeline
create index if not exists audit_log_occurred_at_idx on audit.log(occurred_at desc);

-- (actor_org_id, occurred_at DESC) for Org Admin view "My Users Actions"
create index if not exists audit_log_actor_org_date_idx on audit.log(actor_org_id, occurred_at desc);

-- (target_org_id, occurred_at DESC) for Org Admin view "Changes to My Entity"
create index if not exists audit_log_target_org_date_idx on audit.log(target_org_id, occurred_at desc);

-- (actor_user_id, occurred_at DESC) for filtering by specific user
create index if not exists audit_log_actor_user_date_idx on audit.log(actor_user_id, occurred_at desc);

-- (table_name, record_id) for record history lookup
create index if not exists audit_log_record_lookup_idx on audit.log(table_name, record_id);


-- 1.5 Add Foreign Key for Actor User ID (Crucial for frontend joins)
do $$
begin
    if not exists (select 1 from information_schema.table_constraints where constraint_name = 'audit_log_actor_user_id_fkey') then
        alter table audit.log
        add constraint audit_log_actor_user_id_fkey
        foreign key (actor_user_id)
        references public.users(id);
    end if;
end $$;

-- 2. RLS Policies for audit.log

-- Ensure RLS is enabled (done in 005, but safe to repeat or check)
alter table audit.log enable row level security;

-- Policy: Super Admin View All
drop policy if exists "Super Admin can view all audit logs" on audit.log;
create policy "Super Admin can view all audit logs"
    on audit.log for select
    to authenticated
    using (
        (select role from public.users where auth_user_id = auth.uid()) = 'super_admin'
    );

-- Policy: Org Admin View Their Scope
drop policy if exists "Org Admin can view logs related to their org" on audit.log;
create policy "Org Admin can view logs related to their org"
    on audit.log for select
    to authenticated
    using (
        (select role from public.users where auth_user_id = auth.uid()) = 'org_admin'
        AND
        (
            actor_org_id in (select org_id from public.users where auth_user_id = auth.uid())
            OR
            target_org_id in (select org_id from public.users where auth_user_id = auth.uid())
        )
    );

-- Policy: No Insert/Update/Delete allowed for users (triggers only)
-- Default deny applies if no policy matches.
-- We explicitly do NOT create policies for INSERT/UPDATE/DELETE for 'authenticated'.
-- Service role bypasses RLS, so triggers work fine from server side.

-- 3. Grants (Crucial: ensure authenticated users can actually reach the schema)
grant usage on schema audit to authenticated;
grant select on audit.log to authenticated;

-- 4. Public View for Frontend Access (Avoids need to expose 'audit' schema in API settings)
-- We use security_invoker=true to enforce RLS policies of the underlying audit.log table
create or replace view public.audit_logs_view with (security_invoker = true) as
select
    l.id,
    l.occurred_at,
    l.actor_type,
    l.action,
    l.table_name,
    l.record_id,
    l.system_source,
    l.changes,
    l.old_record,
    l.new_record,
    l.actor_user_id,
    l.actor_org_id,
    l.target_org_id,
    l.meta,
    u.full_name as actor_name,
    u.email as actor_email,
    u.role as actor_role,
    o.name as actor_org_name
from audit.log l
left join public.users u on l.actor_user_id = u.id
left join public.organizations o on u.org_id = o.id;

grant select on public.audit_logs_view to authenticated;
