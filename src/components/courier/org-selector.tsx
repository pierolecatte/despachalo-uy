import { createClient } from "@/lib/supabase/server";
import { OrgSelectorClient } from "./org-selector-client";

interface CourierOrgSelectorProps {
    message?: string;
}

export async function CourierOrgSelector({ message }: CourierOrgSelectorProps) {
    const supabase = await createClient();

    // Fetch active cadeterías
    const { data: organizations } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('type', 'cadeteria')
        .eq('active', true)
        .order('name');

    return (
        <OrgSelectorClient
            organizations={organizations || []}
            message={message}
        />
    );
}
