import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export type CourierContext =
    | { needsSelection: true; isSuperAdmin: true; message?: string }
    | { needsSelection: false; isSuperAdmin: boolean; orgId: string };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function resolveCourierContext(searchParamsOrg?: string | null): Promise<CourierContext> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        throw new Error("Unauthorized");
    }

    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');

    if (isSuperAdmin) {
        if (!searchParamsOrg || !UUID_REGEX.test(searchParamsOrg)) {
            return { needsSelection: true, isSuperAdmin: true, message: "Seleccioná la cadetería a administrar" };
        }

        // Validate the provided org exists and is a cadeteria
        const { data: org, error } = await supabase
            .from('organizations')
            .select('id, type, active')
            .eq('id', searchParamsOrg)
            .maybeSingle();

        if (error || !org) {
            return { needsSelection: true, isSuperAdmin: true, message: "La cadetería indicada no existe." };
        }

        if (org.type !== 'cadeteria') {
            return { needsSelection: true, isSuperAdmin: true, message: "La organización seleccionada no es una Cadetería." };
        }

        if (!org.active) {
            return { needsSelection: true, isSuperAdmin: true, message: "La cadetería indicada no está activa." };
        }

        return { needsSelection: false, isSuperAdmin: true, orgId: org.id };
    } else {
        // Normal user
        const { data: profile, error } = await supabase
            .from('users')
            .select('org_id, organizations!inner(type, active)')
            .eq('auth_user_id', user.id)
            .maybeSingle();

        if (error || !profile?.org_id) {
            throw new Error("No organization profile found.");
        }

        const orgType = (profile.organizations as any)?.type;
        const orgActive = (profile.organizations as any)?.active;

        if (orgType !== 'cadeteria') {
            throw new Error("Forbidden: Tu organización no es de tipo Cadetería.");
        }

        if (!orgActive) {
            throw new Error("Forbidden: Tu organización no está activa.");
        }

        // If they try to access a different org
        if (searchParamsOrg && searchParamsOrg !== profile.org_id) {
            throw new Error("No tenés permisos para administrar otra cadetería.");
        }

        return { needsSelection: false, isSuperAdmin: false, orgId: profile.org_id };
    }
}

export async function validateCourierAction(requestOrgId?: string | null): Promise<string> {
    if (!requestOrgId || !UUID_REGEX.test(requestOrgId)) {
        throw new Error("Invalid organization ID format.");
    }

    const ctx = await resolveCourierContext(requestOrgId);

    if (ctx.needsSelection) {
        throw new Error(ctx.message || "Courier org not selected or invalid.");
    }

    if (!ctx.isSuperAdmin && ctx.orgId !== requestOrgId) {
        throw new Error("Forbidden: org mismatch");
    }

    return ctx.orgId;
}

export async function getDefaultCourierOrg(): Promise<string | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');

    if (isSuperAdmin) {
        const { data: org } = await supabase
            .from('organizations')
            .select('id')
            .eq('type', 'cadeteria')
            .eq('active', true)
            .order('name', { ascending: true })
            .limit(1)
            .maybeSingle();

        return org?.id || null;
    } else {
        const { data: profile } = await supabase
            .from('users')
            .select('org_id')
            .eq('auth_user_id', user.id)
            .maybeSingle();

        return profile?.org_id || null;
    }
}

export async function requireCourierOrg(searchParamsOrg?: string | null): Promise<string> {
    if (!searchParamsOrg) {
        const defaultOrgId = await getDefaultCourierOrg();
        if (defaultOrgId) {
            redirect(`?org=${defaultOrgId}`);
        } else {
            throw new Error("No hay cadeterías activas disponibles u on-boarding pendiente.");
        }
    }

    const ctx = await resolveCourierContext(searchParamsOrg);
    if (ctx.needsSelection) {
        const defaultOrgId = await getDefaultCourierOrg();
        if (defaultOrgId && searchParamsOrg !== defaultOrgId) {
            redirect(`?org=${defaultOrgId}`);
        }
        throw new Error(ctx.message || "La cadetería seleccionada no es válida o no tenés permisos.");
    }

    return ctx.orgId;
}
