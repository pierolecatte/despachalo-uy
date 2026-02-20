import { createClient } from "@/lib/supabase/server";
import { ServiceItem } from "./service-item";
import { ServiceTypeCode } from "@/types/pricing";

export default async function ServicesPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return <div>Access Denied</div>;

    // Fetch all available service types (from public enum or table)
    const { data: serviceTypes } = await supabase
        .from('service_types')
        .select('*')
        .order('name');

    // Fetch current configuration for this courier
    const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

    if (!orgMember) return <div>No organization found</div>;

    const courierOrgId = orgMember.organization_id;

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
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Servicios Habilitados</h2>
                    <p className="text-muted-foreground">
                        Activa o desactiva los servicios que ofrece tu cadetería.
                    </p>
                </div>
            </div>

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
                        />
                    );
                })}
            </div>
        </div>
    );
}
