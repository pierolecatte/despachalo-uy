-- 005_audit_system.sql

-- 1. Create Audit Schema and Table
create schema if not exists audit;

create table if not exists audit.log (
    id uuid primary key default gen_random_uuid(),
    occurred_at timestamptz default now() not null,
    actor_auth_uid uuid, -- auth.users.id
    actor_user_id uuid,  -- public.users.id
    actor_org_id uuid,   -- public.organizations.id
    target_org_id uuid,  -- The org this data belongs to (for RLS/filtering)
    actor_type text not null default 'human' check (actor_type in ('human', 'system')),
    system_source text,  -- e.g., 'cron', 'webhook'
    action text not null check (action in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
    schema_name text not null,
    table_name text not null,
    record_id text,      -- PK as text
    old_record jsonb,
    new_record jsonb,
    changes jsonb,       -- Computed diff
    meta jsonb default '{}'::jsonb
);

-- Note: Indices will be added in 006_audit_panel.sql for cleaner separation of concerns
-- (or here if we prefer monolithic, but plan says separate).
-- However, user prompt asked for 005 to do triggers and basic structure.

-- Enable RLS (Policies in 006)
alter table audit.log enable row level security;

-- 2. Helper Functions

-- Function to get current Actor Auth ID (resilient)
create or replace function audit.get_actor_auth_uid()
returns uuid
language sql
stable
as $$
    select coalesce(
        auth.uid(),
        current_setting('app.actor_auth_uid', true)::uuid
    );
$$;

-- Function to resolve Actor User ID (public.users) from Auth ID
create or replace function audit.get_actor_user_id(p_auth_uid uuid)
returns uuid
language plpgsql
stable
as $$
declare
    v_user_id uuid;
begin
    -- Try to find user with this ID (assuming id=auth.uid linkage)
    select id into v_user_id from public.users where id = p_auth_uid;
    
    if v_user_id is null then
        -- Try by auth_user_id column if present (per schema description)
        -- We wrap in dynamic SQL or just try if we are sure of schema.
        -- Assuming standard mapping based on context.
        begin
             select id into v_user_id from public.users where auth_user_id = p_auth_uid;
        exception when others then
             null;
        end;
    end if;
    
    return v_user_id;
end;
$$;

-- Function to get Actor Org ID
create or replace function audit.get_actor_org_id(p_user_id uuid)
returns uuid
language sql
stable
as $$
    select org_id from public.users where id = p_user_id;
$$;

-- Function to calculate JSONB diff
create or replace function audit.jsonb_diff(val1 jsonb, val2 jsonb)
returns jsonb
language sql
immutable
as $$
    select jsonb_object_agg(key, value)
    from jsonb_each(val2)
    where not (val1 ? key) or (val1 -> key) <> value;
$$;

-- Function to Redact Sensitive Fields
create or replace function audit.redact_sensitive(p_table text, p_data jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
    v_excluded_cols text[] := array['password', 'encrypted_password', 'password_hash', 'secret', 'token', 'reset_token'];
begin
    if (p_table = 'users') then
        return p_data - v_excluded_cols;
    end if;
    return p_data;
end;
$$;

-- 3. Generic Audit Trigger
create or replace function audit.log_row()
returns trigger
language plpgsql
security definer
as $$
declare
    v_actor_auth_uid uuid;
    v_actor_user_id uuid;
    v_actor_org_id uuid;
    v_target_org_id uuid;
    v_actor_type text := 'human';
    v_system_source text;
    v_old_data jsonb;
    v_new_data jsonb;
    v_changes jsonb;
    v_record_id text;
    v_meta jsonb := '{}'::jsonb;
begin
    v_actor_auth_uid := audit.get_actor_auth_uid();

    if v_actor_auth_uid is not null then
        v_actor_user_id := audit.get_actor_user_id(v_actor_auth_uid);
        if v_actor_user_id is not null then
            v_actor_org_id := audit.get_actor_org_id(v_actor_user_id);
        end if;
    else
        v_actor_type := 'system';
        -- Try to get system source from context if possible, or default
        -- v_system_source := current_setting('app.system_source', true);
    end if;

    if (TG_OP = 'DELETE') then
        v_old_data := audit.redact_sensitive(TG_TABLE_NAME, to_jsonb(OLD));
        v_record_id := OLD.id::text;
        
        -- Target Org Logic
        if (TG_TABLE_NAME = 'shipments') then
            v_target_org_id := (OLD.cadeteria_org_id)::uuid;
        elsif (TG_TABLE_NAME = 'users') then
            v_target_org_id := (OLD.org_id)::uuid;
        elsif (TG_TABLE_NAME = 'organizations') then
            v_target_org_id := OLD.id::uuid;
        elsif (TG_TABLE_NAME = 'shipment_files') then
             -- Try to get from shipment
            select cadeteria_org_id into v_target_org_id from public.shipments where id = OLD.shipment_id;
        end if;

        insert into audit.log (
            actor_auth_uid, actor_user_id, actor_org_id, target_org_id, actor_type, system_source,
            action, schema_name, table_name, record_id, old_record, meta
        ) values (
            v_actor_auth_uid, v_actor_user_id, v_actor_org_id, v_target_org_id, v_actor_type, v_system_source,
            'DELETE', TG_TABLE_SCHEMA, TG_TABLE_NAME, v_record_id, v_old_data, v_meta
        );
        return OLD;
    
    elsif (TG_OP = 'UPDATE') then
        v_old_data := audit.redact_sensitive(TG_TABLE_NAME, to_jsonb(OLD));
        v_new_data := audit.redact_sensitive(TG_TABLE_NAME, to_jsonb(NEW));
        v_record_id := NEW.id::text;
        
        v_changes := audit.jsonb_diff(v_old_data, v_new_data);
        
        if (v_changes is null or v_changes = '{}'::jsonb) then
            return NEW;
        end if;

        -- Target Org Logic
        if (TG_TABLE_NAME = 'shipments') then
            v_target_org_id := (NEW.cadeteria_org_id)::uuid;
        elsif (TG_TABLE_NAME = 'users') then
            v_target_org_id := (NEW.org_id)::uuid;
        elsif (TG_TABLE_NAME = 'organizations') then
            v_target_org_id := NEW.id::uuid;
        end if;

        insert into audit.log (
            actor_auth_uid, actor_user_id, actor_org_id, target_org_id, actor_type, system_source,
            action, schema_name, table_name, record_id, old_record, new_record, changes, meta
        ) values (
            v_actor_auth_uid, v_actor_user_id, v_actor_org_id, v_target_org_id, v_actor_type, v_system_source,
            'UPDATE', TG_TABLE_SCHEMA, TG_TABLE_NAME, v_record_id, v_old_data, v_new_data, v_changes, v_meta
        );
        return NEW;

    elsif (TG_OP = 'INSERT') then
        v_new_data := audit.redact_sensitive(TG_TABLE_NAME, to_jsonb(NEW));
        v_record_id := NEW.id::text;

        -- Target Org Logic
        if (TG_TABLE_NAME = 'shipments') then
            v_target_org_id := (NEW.cadeteria_org_id)::uuid;
        elsif (TG_TABLE_NAME = 'users') then
            v_target_org_id := (NEW.org_id)::uuid;
        elsif (TG_TABLE_NAME = 'organizations') then
            v_target_org_id := NEW.id::uuid;
        elsif (TG_TABLE_NAME = 'shipment_files') then
             -- Try to get from shipment
            select cadeteria_org_id into v_target_org_id from public.shipments where id = NEW.shipment_id;
        end if;

        insert into audit.log (
            actor_auth_uid, actor_user_id, actor_org_id, target_org_id, actor_type, system_source,
            action, schema_name, table_name, record_id, new_record, meta
        ) values (
            v_actor_auth_uid, v_actor_user_id, v_actor_org_id, v_target_org_id, v_actor_type, v_system_source,
            'INSERT', TG_TABLE_SCHEMA, TG_TABLE_NAME, v_record_id, v_new_data, v_meta
        );
        return NEW;
    end if;

    return null;
end;
$$;


-- 4. Shipment Files Table (New)
create table if not exists public.shipment_files (
    id uuid primary key default gen_random_uuid(),
    shipment_id uuid not null references public.shipments(id) on delete cascade,
    category text not null default 'legacy', -- 'label', 'receipt', 'doc_generic', 'legacy'
    storage_path text not null,
    created_at timestamptz default now() not null
);

-- Enable RLS
alter table public.shipment_files enable row level security;

-- Policies
drop policy if exists "Users can view files of linked shipments" on public.shipment_files;
create policy "Users can view files of linked shipments"
    on public.shipment_files for select
    using ( exists (select 1 from public.shipments s where s.id = shipment_files.shipment_id) ); 

drop policy if exists "Authenticated users can upload files" on public.shipment_files;
create policy "Authenticated users can upload files"
    on public.shipment_files for insert
    with check ( auth.role() = 'authenticated' );

drop policy if exists "Users can delete files" on public.shipment_files;
create policy "Users can delete files"
    on public.shipment_files for delete
    using ( auth.role() = 'authenticated' );


-- 5. Migration: Move photos to files
insert into public.shipment_files (id, shipment_id, category, storage_path, created_at)
select 
    id, 
    shipment_id, 
    coalesce(photo_type::text, 'legacy') as category, 
    photo_url as storage_path, 
    created_at
from public.shipment_photos
on conflict (id) do nothing;


-- 6. Domain Event Triggers for Shipments

-- Ensure shipment_events has actor_user_id
alter table public.shipment_events 
add column if not exists actor_user_id uuid references public.users(id),
add column if not exists meta jsonb default '{}'::jsonb;

create or replace function public.trigger_shipment_events()
returns trigger
language plpgsql
security definer
as $$
declare
    v_actor_id uuid;
    v_actor_auth_uid uuid;
begin
    v_actor_auth_uid := audit.get_actor_auth_uid();
    if v_actor_auth_uid is not null then
        v_actor_id := audit.get_actor_user_id(v_actor_auth_uid);
    end if;

    -- Event: Created
    if (TG_OP = 'INSERT') then
        insert into public.shipment_events (shipment_id, event_type, description, actor_user_id)
        values (NEW.id, 'shipment_created', 'Envío creado', v_actor_id);
        return NEW;
    end if;

    if (TG_OP = 'UPDATE') then
        -- Event: Status Changed
        if (OLD.status <> NEW.status) then
            insert into public.shipment_events (shipment_id, event_type, description, actor_user_id)
            values (NEW.id, 'status_changed', 'Estado cambiado a ' || NEW.status, v_actor_id);
        end if;

        -- Event: Important Updates (Address, etc)
        -- Only certain fields
        if (OLD.recipient_address <> NEW.recipient_address OR 
            OLD.recipient_city <> NEW.recipient_city OR
            OLD.delivery_type <> NEW.delivery_type OR
            OLD.shipping_cost <> NEW.shipping_cost) then
            
            insert into public.shipment_events (shipment_id, event_type, description, actor_user_id)
            values (NEW.id, 'shipment_updated', 'Datos de entrega actualizados', v_actor_id);
        end if;
        
        return NEW;
    end if;
    
    return null;
end;
$$;

create or replace trigger tr_shipment_domain_events
after insert or update on public.shipments
for each row execute function public.trigger_shipment_events();


-- 7. Domain Event Triggers for Files

create or replace function public.trigger_file_events()
returns trigger
language plpgsql
security definer
as $$
declare
    v_actor_id uuid;
begin
    v_actor_id := audit.get_actor_user_id(audit.get_actor_auth_uid());

    if (TG_OP = 'INSERT') then
        insert into public.shipment_events (shipment_id, event_type, description, actor_user_id, meta)
        values (NEW.shipment_id, 'file_attached', 'Archivo adjunto: ' || NEW.category, v_actor_id, jsonb_build_object('file_id', NEW.id, 'path', NEW.storage_path));
        return NEW;
    end if;

    if (TG_OP = 'DELETE') then
        insert into public.shipment_events (shipment_id, event_type, description, actor_user_id, meta)
        values (OLD.shipment_id, 'file_deleted', 'Archivo eliminado: ' || OLD.category, v_actor_id, jsonb_build_object('file_id', OLD.id, 'path', OLD.storage_path));
        return OLD;
    end if;

    return null;
end;
$$;

create or replace trigger tr_shipment_file_events
after insert or delete on public.shipment_files
for each row execute function public.trigger_file_events();


-- 8. Apply Global Audit Trigger to Critical Tables
drop trigger if exists audit_shipments_changes on public.shipments;
create trigger audit_shipments_changes
after insert or update or delete on public.shipments
for each row execute function audit.log_row();

drop trigger if exists audit_users_changes on public.users;
create trigger audit_users_changes
after insert or update or delete on public.users
for each row execute function audit.log_row();

drop trigger if exists audit_files_changes on public.shipment_files;
create trigger audit_files_changes
after insert or update or delete on public.shipment_files
for each row execute function audit.log_row();

drop trigger if exists audit_org_changes on public.organizations;
create trigger audit_org_changes
after insert or update or delete on public.organizations
for each row execute function audit.log_row();
