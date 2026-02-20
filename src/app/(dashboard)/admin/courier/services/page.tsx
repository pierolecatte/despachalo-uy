import { createClient } from "@/lib/supabase/server";
import { ServiceItem } from "./service-item";
import { ServiceTypeCode } from "@/types/pricing";
import { requireCourierOrg } from "@/lib/auth/get-courier-org";

export default async function ServicesPage(props: { searchParams: Promise<{ [key: string]: string | undefined }> }) {
    const searchParams = await props.searchParams;
    const orgParam = searchParams?.org;

    // Resolve context & enforce selection
    const courierOrgId = await requireCourierOrg(orgParam);

    const supabase = await createClient();

    // Fetch all available service types (from public enum or table)
    const { data: serviceTypes } = await supabase
        .from('service_types')
        .select('*')
        .order('name');

    const { data: configuredServices } = await supabase
        .from('courier_services' as any)
        .select('*')
        .eq('courier_org_id', courierOrgId);

    const configMap = new Map<string, boolean>();
    configuredServices?.forEach((s: any) => {
        configMap.set(s.service_type, s.is_enabled);
    });

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {serviceTypes?.map((service) => {
                    const isEnabled = configMap.has(service.code) ? configMap.get(service.code) : true;

                    return (
                        <ServiceItem
                            key={service.id}
                            serviceCode={service.code as ServiceTypeCode}
                            serviceName={service.name}
                            description={service.description}
                            initialEnabled={!!isEnabled}
                            courierOrgId={courierOrgId}
                        />
                    );
                })}
            </div>
        </div>
    );
}
