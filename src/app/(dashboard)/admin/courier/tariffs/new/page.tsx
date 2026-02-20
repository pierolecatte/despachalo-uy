import { createClient } from "@/lib/supabase/server";
import { requireCourierOrg } from "@/lib/auth/get-courier-org";
import { NewTariffClient } from "./new-tariff-client";

export default async function NewTariffPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
    const searchParams = await props.searchParams;
    const orgParam = searchParams?.org;

    // Resolve context & enforce selection
    const courierOrgId = await requireCourierOrg(orgParam);
    const supabase = await createClient();

    // Fetch Senders for the select
    const { data: senders } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('type', 'remitente')
        .order('name');

    return (
        <NewTariffClient courierOrgId={courierOrgId} senders={senders || []} />
    );
}
